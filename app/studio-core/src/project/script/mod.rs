//! `script.md`: a video's narration, one `## <id>` section per narrated
//! scene, written as it is said. A section's text is its prose with the
//! emphasis markers (`*`, `_`, backticks) and the pause and breath markers
//! (`[pause]`, `[breath]`) removed, each reading (`[records](verb)`) as its
//! word, and whitespace collapsed; nothing else is interpreted. That text,
//! with its readings, pauses and breaths written back (`clip_text`), is
//! what the narration manifest must match.

mod marker;
mod reading;

pub(crate) use marker::markers;
pub use marker::{DEFAULT_BREATH, MAX_BREATH, MAX_PAUSE};
use marker::{Kind, Marker};
pub(crate) use reading::readings;
pub use reading::strip_readings;
use reading::{EMPHASIS, ReadingMark};

use super::video::valid_id;

#[derive(Clone, Debug, PartialEq)]
pub struct Script {
    /// In file order.
    pub sections: Vec<ScriptSection>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ScriptSection {
    /// The heading's id, matching a scene's `id` in video.json.
    pub id: String,
    /// The words as written, which captions, word cues and timings show:
    /// the prose, emphasis and markers stripped, each reading as its word,
    /// whitespace collapsed.
    pub text: String,
    /// Its pauses, in order.
    pub pauses: Vec<ScriptPause>,
    /// Its breaths, in order.
    pub breaths: Vec<ScriptBreath>,
    /// Its readings, in order.
    pub readings: Vec<ScriptReading>,
    /// The prose as written: the lines after the heading, joined by `\n`.
    pub raw: String,
    /// The heading's line (1-based); `raw`'s first line is the next one.
    pub line: usize,
}

/// A `[pause]` in a section.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScriptPause {
    /// How many of the text's whitespace-separated words come before it.
    pub words: usize,
    /// Its seconds, or `None` for the theme's `narration.pause`.
    pub seconds: Option<f64>,
}

/// A `[breath]` in a section: the silence after the word before it is at
/// least this long. Before the first word or after the last it does nothing.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScriptBreath {
    /// How many of the text's whitespace-separated words come before it.
    pub words: usize,
    pub seconds: f64,
}

/// A `[word](reading)` in a section: how the voice reads one word of the
/// text, which keeps the word as written.
#[derive(Clone, Debug, PartialEq)]
pub struct ScriptReading {
    /// The index of the text's whitespace-separated word it is in.
    pub word: usize,
    /// The marked word's byte range in that word, whose punctuation is
    /// outside it.
    pub start: usize,
    pub end: usize,
    /// A part of speech, a respelling or `/phonemes/`, as written.
    pub reading: String,
}

impl Script {
    /// Parses `script.md`. Text before the first heading, a heading that is
    /// not an id, a repeated id and an empty section are errors naming
    /// their line.
    pub fn parse(src: &str) -> Result<Script, String> {
        let mut sections: Vec<ScriptSection> = Vec::new();
        let mut raw: Vec<&str> = Vec::new();
        for (i, line) in src.lines().enumerate() {
            let n = i + 1;
            let Some(id) = heading(line) else {
                if sections.is_empty() && !line.trim().is_empty() {
                    return Err(format!(
                        "line {n}: text before the first `## <id>` heading; every paragraph belongs to a scene's section"
                    ));
                }
                raw.push(line);
                continue;
            };
            close(&mut sections, &mut raw)?;
            if !valid_id(id) {
                return Err(format!(
                    "line {n}: `## {id}` is not a scene id; ids are lowercase letters, digits and `-`"
                ));
            }
            if let Some(first) = sections.iter().find(|s| s.id == id) {
                return Err(format!(
                    "line {n}: `## {id}` repeats the section at line {}; each scene has one section",
                    first.line
                ));
            }
            sections.push(ScriptSection {
                id: id.to_owned(),
                text: String::new(),
                pauses: Vec::new(),
                breaths: Vec::new(),
                readings: Vec::new(),
                raw: String::new(),
                line: n,
            });
        }
        close(&mut sections, &mut raw)?;
        Ok(Script { sections })
    }

    pub fn section(&self, id: &str) -> Option<&ScriptSection> {
        self.sections.iter().find(|s| s.id == id)
    }
}

impl ScriptSection {
    /// The text with each reading written back as `[word](reading)`: what
    /// a voice is given to say. Without readings, `text`.
    pub fn voiced(&self) -> String {
        self.voiced_words().join(" ")
    }

    /// `voiced` with each pause written back as `[pause <seconds>]`, a
    /// bare one at `pause` (the theme's), and each breath as `[breath
    /// <seconds>]` after the pauses at its place: what a clip is made
    /// from, and so what its manifest entry must match. Without readings,
    /// pauses or breaths, `text`.
    pub fn clip_text(&self, pause: f64) -> String {
        let mut out: Vec<String> = Vec::new();
        let mut pauses = self.pauses.iter().peekable();
        let mut breaths = self.breaths.iter().peekable();
        let voiced = self.voiced_words();
        let mut words = voiced.into_iter();
        for i in 0..=words.len() {
            while let Some(p) = pauses.next_if(|p| p.words <= i) {
                out.push(marker::written(Kind::Pause, p.length(pause)));
            }
            while let Some(b) = breaths.next_if(|b| b.words <= i) {
                out.push(marker::written(Kind::Breath, b.seconds));
            }
            out.extend(words.next());
        }
        out.join(" ")
    }

    /// The text's words, each reading around its word.
    fn voiced_words(&self) -> Vec<String> {
        let mut readings = self.readings.iter().peekable();
        let voiced = |(i, word): (usize, &str)| {
            let mut out = String::new();
            let mut from = 0;
            while let Some(r) = readings.next_if(|r| r.word == i) {
                out.push_str(&word[from..r.start]);
                out.push_str(&format!("[{}]({})", &word[r.start..r.end], r.reading));
                from = r.end;
            }
            out + &word[from..]
        };
        self.text
            .split_whitespace()
            .enumerate()
            .map(voiced)
            .collect()
    }
}

impl ScriptPause {
    /// Its seconds: its own, or `pause` (the theme's) for a bare one.
    pub fn length(&self, pause: f64) -> f64 {
        self.seconds.unwrap_or(pause)
    }
}

/// The id of a `## id` line; `#` and `###` lines are text.
fn heading(line: &str) -> Option<&str> {
    let rest = line.trim().strip_prefix("##")?;
    (!rest.starts_with('#')).then(|| rest.trim())
}

/// Gives the last section its collected lines.
fn close(sections: &mut [ScriptSection], raw: &mut Vec<&str>) -> Result<(), String> {
    let lines = std::mem::take(raw);
    let Some(s) = sections.last_mut() else {
        return Ok(());
    };
    s.raw = lines.join("\n");
    let marks = spoken_with_marks(&s.raw);
    (s.text, s.pauses, s.breaths, s.readings) =
        (marks.text, marks.pauses, marks.breaths, marks.readings);
    if s.text.is_empty() {
        return Err(format!(
            "line {}: `## {}` has no text; write what is said, or remove the heading to keep the scene silent",
            s.line, s.id
        ));
    }
    Ok(())
}

/// A section's prose as it is narrated, and what was marked in it.
struct Marked {
    text: String,
    pauses: Vec<ScriptPause>,
    breaths: Vec<ScriptBreath>,
    readings: Vec<ScriptReading>,
}

/// A pause or breath, or a reading, in one line.
enum Mark {
    Silence(Marker),
    Reading(ReadingMark),
}

impl Mark {
    fn start(&self) -> usize {
        match self {
            Mark::Silence(m) => m.start,
            Mark::Reading(r) => r.start,
        }
    }
}

/// `line`'s markers and readings in order, less a marker written inside a
/// reading.
fn marks(line: &str) -> Vec<Mark> {
    let read = readings(line);
    let inside = |m: &Marker| read.iter().any(|r| r.start <= m.start && m.start < r.end);
    let silences: Vec<Marker> = markers(line).into_iter().filter(|m| !inside(m)).collect();
    let mut all: Vec<Mark> = silences.into_iter().map(Mark::Silence).collect();
    all.extend(read.into_iter().map(Mark::Reading));
    all.sort_by_key(Mark::start);
    all
}

/// Prose as it is narrated, with its pauses, breaths and readings. Every
/// pause or breath marker, malformed ones too, is cut from the text and
/// splits the words either side of it; a reading leaves its word in place,
/// and a malformed one only that. Lint names the malformed ones.
fn spoken_with_marks(raw: &str) -> Marked {
    let mut plain = String::new();
    let mut out = Marked {
        text: String::new(),
        pauses: Vec::new(),
        breaths: Vec::new(),
        readings: Vec::new(),
    };
    for line in raw.lines() {
        let mut from = 0;
        for mark in marks(line) {
            match mark {
                Mark::Silence(m) => {
                    plain.push_str(&line[from..m.start]);
                    plain.push(' ');
                    from = m.end;
                    let Ok(seconds) = m.seconds else { continue };
                    let words = spoken(&plain).split_whitespace().count();
                    match m.kind {
                        Kind::Pause => out.pauses.push(ScriptPause { words, seconds }),
                        Kind::Breath => out.breaths.push(ScriptBreath {
                            words,
                            seconds: seconds.unwrap_or(DEFAULT_BREATH),
                        }),
                    }
                }
                Mark::Reading(r) => {
                    plain.push_str(&line[from..r.start]);
                    from = r.end;
                    let word = &line[r.word.0..r.word.1];
                    if let Ok(reading) = r.reading {
                        let (index, start) = next_word(&plain);
                        let len = word.chars().filter(|c| !EMPHASIS.contains(c));
                        out.readings.push(ScriptReading {
                            word: index,
                            start,
                            end: start + len.map(char::len_utf8).sum::<usize>(),
                            reading,
                        });
                    }
                    plain.push_str(word);
                }
            }
        }
        plain.push_str(&line[from..]);
        plain.push('\n');
    }
    out.text = spoken(&plain);
    out
}

/// Where text appended to `plain` lands in its spoken words: the word's
/// index, and the bytes of that word already there.
fn next_word(plain: &str) -> (usize, usize) {
    let said: String = plain.chars().filter(|c| !EMPHASIS.contains(c)).collect();
    let words = said.split_whitespace().count();
    match said.chars().next_back() {
        Some(c) if !c.is_whitespace() => {
            let last = said.split_whitespace().next_back().unwrap_or_default();
            (words - 1, last.len())
        }
        _ => (words, 0),
    }
}

/// Prose as it is narrated: emphasis markers removed, whitespace collapsed.
fn spoken(raw: &str) -> String {
    let plain: String = raw.chars().filter(|c| !EMPHASIS.contains(c)).collect();
    plain.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests;
