//! `script.md`: a video's narration, one `## <id>` section per narrated
//! scene, written as it is said. A section's text is its prose with the
//! emphasis markers (`*`, `_`, backticks) and the pause and breath markers
//! (`[pause]`, `[breath]`) removed and whitespace collapsed; nothing else is
//! interpreted. That text, with its pauses and breaths written back at their
//! lengths (`clip_text`), is what the narration manifest must match.

mod marker;

use marker::Kind;
pub(crate) use marker::markers;
pub use marker::{DEFAULT_BREATH, MAX_BREATH, MAX_PAUSE};

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
    /// What is said: the prose, emphasis and pause markers stripped and
    /// whitespace collapsed.
    pub text: String,
    /// Its pauses, in order.
    pub pauses: Vec<ScriptPause>,
    /// Its breaths, in order.
    pub breaths: Vec<ScriptBreath>,
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
    /// The text with each pause written back as `[pause <seconds>]`, a
    /// bare one at `pause` (the theme's), and each breath as `[breath
    /// <seconds>]` after the pauses at its place: what a clip is made
    /// from, and so what its manifest entry must match. Without either,
    /// `text`.
    pub fn clip_text(&self, pause: f64) -> String {
        let mut out: Vec<String> = Vec::new();
        let mut pauses = self.pauses.iter().peekable();
        let mut breaths = self.breaths.iter().peekable();
        let count = self.text.split_whitespace().count();
        let mut words = self.text.split_whitespace();
        for i in 0..=count {
            while let Some(p) = pauses.next_if(|p| p.words <= i) {
                out.push(marker::written(Kind::Pause, p.length(pause)));
            }
            while let Some(b) = breaths.next_if(|b| b.words <= i) {
                out.push(marker::written(Kind::Breath, b.seconds));
            }
            out.extend(words.next().map(str::to_owned));
        }
        out.join(" ")
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
    (s.text, s.pauses, s.breaths) = spoken_with_marks(&s.raw);
    if s.text.is_empty() {
        return Err(format!(
            "line {}: `## {}` has no text; write what is said, or remove the heading to keep the scene silent",
            s.line, s.id
        ));
    }
    Ok(())
}

/// Prose as it is narrated, with its pauses and its breaths. Every marker,
/// malformed ones too, is cut from the text and splits the words either
/// side of it; lint names the malformed ones.
fn spoken_with_marks(raw: &str) -> (String, Vec<ScriptPause>, Vec<ScriptBreath>) {
    let mut plain = String::new();
    let mut pauses = Vec::new();
    let mut breaths = Vec::new();
    for line in raw.lines() {
        let mut from = 0;
        for m in markers(line) {
            plain.push_str(&line[from..m.start]);
            plain.push(' ');
            from = m.end;
            let Ok(seconds) = m.seconds else { continue };
            let words = spoken(&plain).split_whitespace().count();
            match m.kind {
                Kind::Pause => pauses.push(ScriptPause { words, seconds }),
                Kind::Breath => breaths.push(ScriptBreath {
                    words,
                    seconds: seconds.unwrap_or(DEFAULT_BREATH),
                }),
            }
        }
        plain.push_str(&line[from..]);
        plain.push('\n');
    }
    (spoken(&plain), pauses, breaths)
}

/// Prose as it is narrated: emphasis markers removed, whitespace collapsed.
fn spoken(raw: &str) -> String {
    let plain: String = raw
        .chars()
        .filter(|c| !matches!(c, '*' | '_' | '`'))
        .collect();
    plain.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests;
