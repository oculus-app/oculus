//! The move's record, and the guard against a build from before it. Both are
//! `.library-move/journal.json`: every build since the Drive move reads that
//! file before it plans anything and refuses one whose `format` is not its
//! own, once `.library-move/done` no longer says `drive`. So the journal is
//! written first, then the marker, and neither is ever removed.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::library::migrate::journal::{self as drive, dir, Phase};

const JOURNAL: &str = "journal.json";

/// The format an older build's reader does not know.
pub const FORMAT: u32 = 2;

/// `.library-move/done` while the move is under way, and once it is over.
pub const MOVING: &str = "state-moving";
pub const DONE: &str = "state";

/// One rename, data-dir-relative.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Move {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub done: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Journal {
    pub format: u32,
    /// `moving` until every rename has landed.
    pub phase: Phase,
    pub moves: Vec<Move>,
    /// The fields an older build's reader requires before it looks at
    /// `format`, so its refusal names the format rather than a missing field.
    #[serde(flatten)]
    older: OlderReader,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
struct OlderReader {
    steps: [u8; 0],
    rules: [u8; 0],
    notes: [u8; 0],
    renamed_records: [u8; 0],
    lectures: [u8; 0],
    relink: [u8; 0],
    left: [u8; 0],
}

impl Journal {
    pub fn new(moves: Vec<Move>) -> Self {
        let phase = match moves.is_empty() {
            true => Phase::Moved,
            false => Phase::Moving,
        };
        Journal {
            format: FORMAT,
            phase,
            moves,
            older: OlderReader::default(),
        }
    }
}

pub fn path(data_dir: &Path) -> PathBuf {
    dir(data_dir).join(JOURNAL)
}

/// What the marker says, trimmed; `None` when there is none.
pub fn marker(data_dir: &Path) -> Option<String> {
    drive::marker(data_dir)
}

/// True once this move has finished here, or found nothing to do.
pub fn is_done(data_dir: &Path) -> bool {
    marker(data_dir).as_deref() == Some(DONE)
}

pub fn mark(data_dir: &Path, word: &str) -> Result<(), String> {
    drive::write_marker(data_dir, word)
}

/// The journal a run in progress left.
pub fn load(data_dir: &Path) -> Result<Journal, String> {
    let path = path(data_dir);
    let raw = std::fs::read(&path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let journal: Journal =
        serde_json::from_slice(&raw).map_err(|e| format!("read {}: {e}", path.display()))?;
    if journal.format != FORMAT {
        return Err(format!(
            "{} is from another version of Oculus (format {})",
            path.display(),
            journal.format
        ));
    }
    Ok(journal)
}

pub fn save(data_dir: &Path, journal: &Journal) -> Result<(), String> {
    crate::runtime::atomic_write::json(&path(data_dir), journal)
}

/// Writes the guard: the Drive move's own journal steps aside under its new
/// name, the fact that it finished is kept in its own marker, this journal
/// takes `journal.json`, and only then does the marker change. A build that
/// still reads `drive` there ignores the journal, and nothing has moved yet.
pub fn guard(data_dir: &Path, journal: &Journal, word: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir(data_dir)).map_err(|e| e.to_string())?;
    drive::step_aside(data_dir)?;
    save(data_dir, journal)?;
    mark(data_dir, word)
}
