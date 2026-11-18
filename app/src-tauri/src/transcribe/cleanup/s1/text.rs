//! What S1-mini is sent and how a transcript is cut for it. The system prompt
//! and the control line are the input format it was trained on, word for word
//! (its model card); anything else and it garbles.

use serde_json::{json, Value};

pub(super) const SYSTEM: &str = "You are a text normalizer for speech-to-text transcripts. The input begins with a control line specifying the styling, structure, and context settings; clean the transcript to match those settings and output only the cleaned text.";

pub(super) const CONTROL_LINE: &str =
    "[Styling: semi-formal] [Structure: lists] [Context: general]";

/// Longer transcripts are cut at sentences into pieces of about this many tokens.
pub(super) const CHUNK_TOKENS: usize = 1_000;

/// About four characters a token for English through Qwen's tokenizer, rounded
/// up; the live test checks it against llama-server's own count.
pub(super) fn estimate_tokens(text: &str) -> usize {
    text.chars().count().div_ceil(4)
}

/// The output cap: 1.3 × the input and a margin. A cleanup is never much
/// longer than what was said, and an uncapped run can loop for thousands of
/// tokens.
pub(super) fn max_tokens(transcript: &str) -> usize {
    estimate_tokens(transcript) * 13 / 10 + 32
}

/// One chat completion request for one piece of a transcript. Greedy; thinking
/// is off in the server's chat template (`server.rs`).
pub(super) fn request(piece: &str) -> Value {
    json!({
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": format!("{CONTROL_LINE}\n{piece}")},
        ],
        "temperature": 0,
        "max_tokens": max_tokens(piece),
    })
}

/// S1-mini knows English only: a transcript with letters from another script,
/// or speech set to another language in Settings → Transcription, is left as
/// it was heard. `language` is Whisper's code: `en`, `auto` or another.
pub(super) fn english(transcript: &str, language: &str) -> bool {
    matches!(language, "en" | "auto") && !transcript.chars().any(foreign_letter)
}

fn foreign_letter(c: char) -> bool {
    c.is_alphabetic() && !latin(c)
}

/// Latin letters, their accents and ligatures, and the micro sign.
fn latin(c: char) -> bool {
    matches!(
        c as u32,
        0x41..=0x5A
            | 0x61..=0x7A
            | 0xAA
            | 0xB5
            | 0xBA
            | 0xC0..=0x24F
            | 0x250..=0x2AF
            | 0x300..=0x36F
            | 0x1D00..=0x1DBF
            | 0x1E00..=0x1EFF
            | 0x2C60..=0x2C7F
            | 0xA720..=0xA7FF
            | 0xAB30..=0xAB6F
            | 0xFB00..=0xFB06
            | 0xFF21..=0xFF3A
            | 0xFF41..=0xFF5A
    )
}

/// `transcript` in pieces of at most `limit` estimated tokens, cut after a
/// sentence's end (`.`, `?`, `!`, `…` before a space) or at a line break; a
/// sentence longer than `limit` is cut between words.
pub(super) fn chunks(transcript: &str, limit: usize) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut current = String::new();
    for sentence in sentences(transcript) {
        if estimate_tokens(sentence) > limit {
            pieces.extend(nonempty(std::mem::take(&mut current)));
            pieces.extend(by_words(sentence, limit));
            continue;
        }
        let joined = if current.is_empty() {
            sentence.to_string()
        } else {
            format!("{current} {sentence}")
        };
        if estimate_tokens(&joined) > limit {
            pieces.extend(nonempty(std::mem::replace(
                &mut current,
                sentence.to_string(),
            )));
        } else {
            current = joined;
        }
    }
    pieces.extend(nonempty(current));
    pieces
}

fn nonempty(piece: String) -> Option<String> {
    (!piece.trim().is_empty()).then_some(piece)
}

fn sentences(text: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut start = 0;
    let mut chars = text.char_indices().peekable();
    while let Some((i, c)) = chars.next() {
        let next = chars.peek().map(|&(_, n)| n);
        let ends = c == '\n'
            || (matches!(c, '.' | '?' | '!' | '…') && next.is_none_or(char::is_whitespace));
        if ends {
            let end = i + c.len_utf8();
            out.push(text[start..end].trim());
            start = end;
        }
    }
    out.push(text[start..].trim());
    out.retain(|s| !s.is_empty());
    out
}

fn by_words(sentence: &str, limit: usize) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut current = String::new();
    for word in sentence.split_whitespace() {
        let joined = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };
        if !current.is_empty() && estimate_tokens(&joined) > limit {
            pieces.push(std::mem::replace(&mut current, word.to_string()));
        } else {
            current = joined;
        }
    }
    pieces.extend(nonempty(current));
    pieces
}

/// The pieces' cleanups as one message: prose runs on with a space, and a
/// piece holding a list or paragraphs is set apart by a blank line. Empty
/// pieces (filler only) are dropped.
pub(super) fn join(cleaned: &[String]) -> String {
    let mut out = String::new();
    let mut last_multiline = false;
    for piece in cleaned.iter().map(|p| p.trim()).filter(|p| !p.is_empty()) {
        let multiline = piece.contains('\n');
        if !out.is_empty() {
            out.push_str(if multiline || last_multiline {
                "\n\n"
            } else {
                " "
            });
        }
        out.push_str(piece);
        last_multiline = multiline;
    }
    out
}
