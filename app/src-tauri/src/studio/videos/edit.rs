//! Setting one top-level key of video.json in its text, so the rest of the
//! file (the agent's formatting, key order, keys the app does not model)
//! stays as it was. `captions` and `title` are written this way.

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

/// `text` with its top-level `key` (a plain name, no escapes) set to
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
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("not valid JSON: {e}"))?;
    if !value.is_object() {
        return Err("video.json must be a JSON object".to_owned());
    }
    let quoted = format!("\"{key}\"");
    let keys = top_level_keys(text);
    if let Some(&(_, end)) = keys.iter().find(|(k, _)| *k == quoted) {
        let colon = end
            + text[end..]
                .find(':')
                .ok_or(format!("no `:` after `{key}`"))?;
        let rest = &text[colon + 1..];
        let start = colon + 1 + (rest.len() - rest.trim_start().len());
        let mut values =
            serde_json::Deserializer::from_str(&text[start..]).into_iter::<serde_json::Value>();
        values
            .next()
            .ok_or(format!("no value after `{key}`"))?
            .map_err(|e| format!("`{key}`'s value: {e}"))?;
        let old_end = start + values.byte_offset();
        return Ok(format!("{}{literal}{}", &text[..start], &text[old_end..]));
    }
    let anchor = match before {
        Some(name) => keys.iter().find(|(k, _)| *k == format!("\"{name}\"")),
        None => keys.first(),
    }
    .map(|(k, end)| end - k.len());
    let open = text.find('{').ok_or("no `{`")?;
    let at = anchor.unwrap_or(open + 1);
    let line_start = text[..at].rfind('\n').map_or(0, |i| i + 1);
    let indent = &text[line_start..at];
    let insert = if anchor.is_some() && indent.trim().is_empty() {
        format!("{quoted}: {literal},\n{indent}")
    } else if anchor.is_some() {
        format!("{quoted}: {literal}, ")
    } else {
        format!(" {quoted}: {literal},")
    };
    let edited = format!("{}{insert}{}", &text[..at], &text[at..]);
    serde_json::from_str::<serde_json::Value>(&edited)
        .map_err(|e| format!("adding `{key}` broke the file ({e}); add it by hand"))?;
    Ok(edited)
}

/// The keys of the top-level object, quoted, each with the byte just after
/// its closing quote.
fn top_level_keys(text: &str) -> Vec<(String, usize)> {
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
                    keys.push((text[start..end].to_owned(), end));
                }
                i = end;
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    keys
}
