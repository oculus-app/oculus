//! A `Brief` as the compact text `oculus studio brief` prints: no colour,
//! nothing the agent wrote itself (the storyboard entry, the neighbours'
//! hand-offs, the script text), and one line per sentence of narration
//! from its start, each word but a function word followed by its time as
//! `gradient(1.36)` and each pause as `[pause 1.0 s](14.47)`.

use std::fmt::{self, Display};

use studio_core::CuedPause;

use super::{Brief, Narration, Neighbour};

impl Display for Brief {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let props = serde_json::to_string(&self.props).unwrap_or_default();
        writeln!(
            f,
            "Scene {} ({} of {}), component {}, props {props}",
            name(self.id.as_deref(), self.index),
            self.index,
            self.count,
            self.component
        )?;
        writeln!(f, "Folder {}", self.dir.display())?;
        writeln!(f)?;
        neighbour(f, "Previous", self.previous.as_ref(), "first scene")?;
        neighbour(f, "Next", self.next.as_ref(), "last scene")?;
        writeln!(f)?;
        let notes = &self.notes;
        let what = if notes.named {
            "Notes (named in the entry)"
        } else {
            "Notes (all; the entry names none)"
        };
        if notes.paths.is_empty() {
            writeln!(f, "Notes: none (no notes/ folder)")?;
        } else {
            writeln!(f, "{what}: {}", notes.paths.join(" "))?;
        }
        if !notes.missing.is_empty() {
            writeln!(f, "  no such file: {}", notes.missing.join(" "))?;
        }
        writeln!(f)?;
        narration(f, &self.narration)?;
        writeln!(f)?;
        writeln!(f, "Check:")?;
        for c in &self.commands {
            writeln!(f, "{c}")?;
        }
        Ok(())
    }
}

fn name(id: Option<&str>, index: usize) -> String {
    id.map_or_else(|| format!("#{index}"), str::to_owned)
}

fn neighbour(
    f: &mut fmt::Formatter<'_>,
    which: &str,
    n: Option<&Neighbour>,
    none: &str,
) -> fmt::Result {
    let Some(n) = n else {
        return writeln!(f, "{which}: none ({none})");
    };
    let written = if n.written {
        "written"
    } else {
        "not written yet"
    };
    writeln!(
        f,
        "{which}: {} ({}), component {} ({written})",
        name(n.id.as_deref(), n.index),
        n.index,
        n.component
    )
}

fn narration(f: &mut fmt::Formatter<'_>, n: &Narration) -> fmt::Result {
    match n {
        Narration::Silent { seconds } => {
            writeln!(f, "Narration: none, a silent scene of {seconds:.2} s")
        }
        Narration::Unavailable { error, .. } => writeln!(f, "Narration: unavailable: {error}"),
        Narration::Spoken {
            seconds,
            sentences,
            pauses,
        } => {
            let and_pauses = match pauses.is_empty() {
                true => "",
                false => ", [pause](t) when pause() returns",
            };
            writeln!(
                f,
                "Narration: {seconds:.2} s, scene seconds; each sentence from its start, \
                 word(t) when word() finds it{and_pauses}"
            )?;
            let pause = |p: &CuedPause| format!("[pause {:.1} s]({:.2})", p.end - p.start, p.start);
            let mut line: Vec<String> = pauses
                .iter()
                .filter(|p| p.after.is_none())
                .map(pause)
                .collect();
            let mut index = 0;
            for sentence in sentences {
                let start = line.is_empty().then(|| sentence.first()).flatten();
                for (k, w) in sentence.iter().enumerate() {
                    line.push(if k == 0 && start.is_some() {
                        w.text.clone()
                    } else {
                        timed(&w.text, w.start)
                    });
                    let after = pauses.iter().filter(|p| p.after == Some(index));
                    line.extend(after.map(pause));
                    index += 1;
                }
                match start {
                    Some(w) => writeln!(f, "{:.2} {}", w.start, line.join(" "))?,
                    None => writeln!(f, "{}", line.join(" "))?,
                }
                line.clear();
            }
            Ok(())
        }
    }
}

/// `gradient(1.36),`: the word with its time before any trailing
/// punctuation, or the bare word for a function word, which no beat cues.
fn timed(word: &str, t: f64) -> String {
    let core = word.trim_end_matches(|c: char| !c.is_alphanumeric());
    let bare = core
        .trim_start_matches(|c: char| !c.is_alphanumeric())
        .to_lowercase();
    if core.is_empty() || FUNCTION_WORDS.contains(&bare.as_str()) {
        return word.to_owned();
    }
    format!("{core}({t:.2}){}", &word[core.len()..])
}

/// Words a scene never cues on, so their times are left out.
const FUNCTION_WORDS: &[&str] = &[
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "does", "for", "from", "has",
    "have", "i", "if", "in", "is", "it", "it's", "its", "no", "not", "of", "on", "or", "our", "so",
    "than", "that", "the", "their", "then", "there", "these", "they", "this", "to", "was", "we",
    "were", "what", "when", "which", "with", "you", "your",
];
