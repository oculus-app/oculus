//! Setting one top-level key of video.json in its text, so the rest of the
//! file (the agent's formatting, key order, keys the app does not model)
//! stays as it was.

use std::ops::Range;
use std::path::Path;

/// Rewrites `<dir>/video.json` with `edit`, atomically, and only when the
/// text changes.
pub(super) fn edit_video_json(
    dir: &Path,
    edit: impl FnOnce(&str) -> Result<String, String>,
) -> Result<(), String> {
    let path = dir.join("video.json");
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    let edited = edit(&text).map_err(|e| format!("{}: {e}", path.display()))?;
    if edited != text {
        let tmp = dir.join(".video.json.tmp");
        crate::runtime::atomic_write::write(&path, &tmp, edited.as_bytes())?;
    }
    Ok(())
}

/// `text` with its top-level `key` set to
/// `literal` (JSON): the old value
/// replaced where the key is, else the key added before the key `before`
/// (the first key when `None`; on a line of its own when that key starts
/// one), else after the opening brace.
pub(super) fn with_key(
    text: &str,
    key: &str,
    literal: &str,
    before: Option<&str>,
) -> Result<String, String> {
    let keys = top_level_keys(text)?;
    let quoted = format!("\"{key}\"");
    if let Some((_, span)) = keys.iter().find(|(name, _)| name == key) {
        let value = value_span(text, span.end)?;
        return Ok(format!(
            "{}{literal}{}",
            &text[..value.start],
            &text[value.end..]
        ));
    }
    let anchor = match before {
        Some(name) => keys.iter().find(|(key, _)| key == name),
        None => keys.first(),
    }
    .map(|(_, span)| span.start);
    let open = text.find('{').ok_or("no `{`")?;
    let at = anchor.unwrap_or(open + 1);
    let line_start = text[..at].rfind('\n').map_or(0, |i| i + 1);
    let indent = &text[line_start..at];
    let insert = if anchor.is_some() && indent.trim().is_empty() {
        format!("{quoted}: {literal},\n{indent}")
    } else if anchor.is_some() {
        format!("{quoted}: {literal}, ")
    } else if keys.is_empty() {
        format!(" {quoted}: {literal}")
    } else {
        format!(" {quoted}: {literal},")
    };
    let edited = format!("{}{insert}{}", &text[..at], &text[at..]);
    serde_json::from_str::<serde_json::Value>(&edited)
        .map_err(|e| format!("adding `{key}` broke the file ({e}); add it by hand"))?;
    Ok(edited)
}

/// Removes a top-level member and its separator while keeping the other members' text.
pub(super) fn without_key(text: &str, key: &str) -> Result<String, String> {
    let keys = top_level_keys(text)?;
    let Some(index) = keys.iter().position(|(name, _)| name == key) else {
        return Ok(text.to_owned());
    };
    let span = &keys[index].1;
    let value = value_span(text, span.end)?;
    let (start, end) = match (index.checked_sub(1), keys.get(index + 1)) {
        (Some(previous), _) => (value_span(text, keys[previous].1.end)?.end, value.end),
        (None, Some((_, next))) => {
            let line_start = |at| text[..at].rfind('\n').map_or(0, |i| i + 1);
            let first_line = line_start(span.start);
            let next_line = line_start(next.start);
            if value.end <= next_line && text[next_line..next.start].trim().is_empty() {
                if text[first_line..span.start].trim().is_empty() {
                    (first_line, next_line)
                } else {
                    let separator = text[value.end..next.start]
                        .find(',')
                        .ok_or("expected a comma between keys")?;
                    (span.start, value.end + separator + 1)
                }
            } else {
                (span.start, next.start)
            }
        }
        (None, None) => (span.start, value.end),
    };
    Ok(format!("{}{}", &text[..start], &text[end..]))
}

fn value_span(text: &str, key_end: usize) -> Result<Range<usize>, String> {
    let rest = text[key_end..].trim_start();
    let value = rest
        .strip_prefix(':')
        .ok_or("expected a colon after the key")?
        .trim_start();
    let start = text.len() - value.len();
    let mut values = serde_json::Deserializer::from_str(value).into_iter::<serde_json::Value>();
    values
        .next()
        .ok_or("expected a value after the key")?
        .map_err(|e| e.to_string())?;
    Ok(start..start + values.byte_offset())
}

/// The decoded keys of the top-level object with their byte ranges.
fn top_level_keys(text: &str) -> Result<Vec<(String, Range<usize>)>, String> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("not valid JSON: {e}"))?;
    if !value.is_object() {
        return Err("video.json must be a JSON object".to_owned());
    }
    let bytes = text.as_bytes();
    let mut keys = Vec::new();
    let mut depth = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'{' | b'[' => depth += 1,
            b'}' | b']' => depth = depth.saturating_sub(1),
            b'"' => {
                let start = i;
                i += 1;
                while i < bytes.len() && bytes[i] != b'"' {
                    i += if bytes[i] == b'\\' { 2 } else { 1 };
                }
                let end = (i + 1).min(bytes.len());
                let is_key = text[end..].trim_start().starts_with(':');
                if depth == 1 && is_key {
                    let key = serde_json::from_str(&text[start..end]).map_err(|e| e.to_string())?;
                    keys.push((key, start..end));
                }
                i = end;
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    Ok(keys)
}
