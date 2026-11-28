//! The log of every pronunciation decision and lexicon change, for Studio
//! -> Pronunciation's History tab and its Revert. One JSON event per line
//! of `<data dir>/studio/pronunciations/history.jsonl`, each appended with
//! one write on a file opened for appending, so the CLI and the app (two
//! processes) never rewrite each other's lines. Whether an event was
//! reverted is not stored: a later `reverted` event naming it says so.

use std::collections::HashSet;
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::library::paths::iso8601_utc;
use crate::runtime::clock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    /// The student accepted a suggestion.
    Accepted,
    /// The student kept the guess.
    Kept,
    /// The student marked a suggestion wrong.
    Wrong,
    Added,
    Edited,
    Removed,
    Reverted,
}

impl Kind {
    /// Whether Revert can undo it: the kinds that changed a lexicon.
    pub fn revertable(self) -> bool {
        matches!(
            self,
            Kind::Accepted | Kind::Kept | Kind::Added | Kind::Edited | Kind::Removed
        )
    }
}

/// One line of the log.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// `<unix millis>-<random hex>`.
    pub id: String,
    /// `YYYY-MM-DDTHH:MM:SS`, UTC.
    pub at: String,
    pub kind: Kind,
    pub word: String,
    pub subject: Option<String>,
    /// The lexicon value before (`None`: the word had none).
    pub previous: Option<String>,
    /// The lexicon value after (`None`: removed); for `wrong`, the
    /// suggestion sent back.
    pub reading: Option<String>,
    /// `wrong`: the student's note.
    pub note: Option<String>,
    /// A decision's video slug.
    pub video: Option<String>,
    /// `reverted`: the id of the event it undid.
    pub reverts: Option<String>,
}

impl Event {
    /// A new event of `kind` for `word`, stamped now; the other fields are
    /// the caller's to fill.
    pub fn new(kind: Kind, word: &str, subject: Option<&str>) -> Self {
        Self {
            id: new_id(),
            at: iso8601_utc(clock::now_secs()),
            kind,
            word: word.to_owned(),
            subject: subject.map(str::to_owned),
            previous: None,
            reading: None,
            note: None,
            video: None,
            reverts: None,
        }
    }
}

/// An event as the app reads it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Logged {
    #[serde(flatten)]
    pub event: Event,
    /// A later `reverted` event names this one.
    pub reverted: bool,
}

/// The log file.
#[derive(Debug, Clone)]
pub struct History {
    pub path: PathBuf,
}

impl History {
    /// Appends `event` as one line in a single write.
    pub fn append(&self, event: &Event) -> Result<(), String> {
        let file = self.path.display();
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        let mut line = serde_json::to_string(event).map_err(|e| e.to_string())?;
        line.push('\n');
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .and_then(|mut f| f.write_all(line.as_bytes()))
            .map_err(|e| format!("{file}: {e}"))
    }

    /// Every event, newest first. A line that does not parse is skipped and
    /// logged; a missing file is an empty log.
    pub fn read(&self) -> Result<Vec<Logged>, String> {
        let text = match std::fs::read_to_string(&self.path) {
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(format!("{}: {e}", self.path.display())),
        };
        let mut events = Vec::new();
        for (n, line) in text.lines().enumerate() {
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<Event>(line) {
                Ok(event) => events.push(event),
                Err(e) => elog!(
                    "[oculus] pronunciation history {}:{}: {e}",
                    self.path.display(),
                    n + 1
                ),
            }
        }
        let undone: HashSet<String> = events
            .iter()
            .filter(|e| e.kind == Kind::Reverted)
            .filter_map(|e| e.reverts.clone())
            .collect();
        Ok(events
            .into_iter()
            .rev()
            .map(|event| Logged {
                reverted: undone.contains(&event.id),
                event,
            })
            .collect())
    }

    /// Appends `event`, logging rather than failing: the change it records
    /// is already made.
    pub fn record(&self, event: &Event) {
        if let Err(e) = self.append(event) {
            elog!("[oculus] pronunciation history: {e}");
        }
    }
}

/// `<unix millis>-<8 random hex digits>`.
fn new_id() -> String {
    use ring::rand::SecureRandom;
    let mut b = [0u8; 4];
    // The system's random source does not fail on the platforms Oculus runs.
    let _ = ring::rand::SystemRandom::new().fill(&mut b);
    let hex: String = b.iter().map(|x| format!("{x:02x}")).collect();
    format!("{}-{hex}", clock::now_nanos() / 1_000_000)
}
