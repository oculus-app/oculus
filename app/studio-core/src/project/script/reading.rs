//! A reading in script.md: `[records](verb)` says how the voice reads the
//! word in the brackets. The word stays in the text as it is written, so
//! captions, word cues and timings never show the reading. Only the shape
//! is checked here: one whole word, and a reading of letters, `-` and `'`
//! (a part of speech, or a respelling) or `/phonemes/`. The voice engine
//! checks that it can read it. A malformed one keeps its word, loses its
//! reading, and lint names it.

/// Markdown emphasis, which the spoken text drops.
pub(super) const EMPHASIS: [char; 3] = ['*', '_', '`'];

/// A `[word](reading)` in one line of script.md.
#[derive(Clone, Debug, PartialEq)]
pub struct ReadingMark {
    /// Byte range in the line, brackets and parentheses included.
    pub start: usize,
    pub end: usize,
    /// Byte range in the line of the text in the brackets.
    pub word: (usize, usize),
    /// The reading as written, trimmed, or why the mark is malformed.
    pub reading: Result<String, String>,
}

/// Every reading in `line`, in order: a `[...]` with no bracket inside it
/// that `(` follows, up to the next `)` or the line's end.
pub fn readings(line: &str) -> Vec<ReadingMark> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(open) = line[from..].find('[').map(|i| from + i) {
        let inner = open + 1;
        let close = line[inner..].find(['[', ']']).map(|i| inner + i);
        let Some(close) = close.filter(|&c| line[c..].starts_with("](")) else {
            from = inner;
            continue;
        };
        let paren = close + 2;
        let shut = line[paren..].find(')').map(|i| paren + i);
        let end = shut.map_or(line.len(), |s| s + 1);
        out.push(ReadingMark {
            start: open,
            end,
            word: (inner, close),
            reading: reading(line, open, close, shut),
        });
        from = end;
    }
    out
}

/// `text` with each reading written as its word: what a voice that takes
/// no readings is given.
pub fn strip_readings(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for (i, line) in text.split('\n').enumerate() {
        if i > 0 {
            out.push('\n');
        }
        let mut from = 0;
        for m in readings(line) {
            out.push_str(&line[from..m.start]);
            out.push_str(&line[m.word.0..m.word.1]);
            from = m.end;
        }
        out.push_str(&line[from..]);
    }
    out
}

/// The reading of the mark opening at `open`, whose brackets close at
/// `close` and whose parentheses at `shut`.
fn reading(line: &str, open: usize, close: usize, shut: Option<usize>) -> Result<String, String> {
    let written = &line[open..shut.map_or(line.len(), |s| s + 1)];
    let Some(shut) = shut else {
        return Err(format!("`{written}` has no closing `)`"));
    };
    let word: String = line[open + 1..close]
        .chars()
        .filter(|c| !EMPHASIS.contains(c))
        .collect();
    if word.is_empty() || word.chars().any(char::is_whitespace) {
        return Err(format!(
            "`{written}` is not a reading: the brackets hold one word, as it is written"
        ));
    }
    let joins = |c: char| c.is_alphanumeric() || matches!(c, '\'' | '\u{2019}' | '-');
    let before = line[..open].chars().next_back();
    let after = line[shut + 1..].chars().next();
    if before.is_some_and(joins) || after.is_some_and(joins) {
        return Err(format!(
            "`{written}` marks part of a word; a reading wraps the whole word, its punctuation outside"
        ));
    }
    let value = line[close + 2..shut].trim();
    let phonemes = value
        .strip_prefix('/')
        .and_then(|v| v.strip_suffix('/'))
        .is_some_and(|v| !v.is_empty() && !v.contains('/') && !v.chars().any(char::is_whitespace));
    let spelt = value.chars().any(char::is_alphabetic)
        && value
            .chars()
            .all(|c| c.is_alphabetic() || matches!(c, '-' | '\''));
    if !phonemes && !spelt {
        return Err(format!(
            "`{written}` is not a reading; write a part of speech (`[records](verb)`), a respelling in real words (`[softmax](SOFT-max)`) or phonemes (`[Cauchy](/k\u{2c8}O\u{283}i/)`)"
        ));
    }
    Ok(value.to_owned())
}
