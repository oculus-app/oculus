//! The move's record on disk, in `<data dir>/.library-move/`: the plan with a
//! state per step (`journal.drive.json`), the steps done since it was last
//! written (`done.log`, one index a line, appended as each lands), the lock
//! every launch move takes turns on, and the marker that says this move is
//! over (`drive`). `journal.json` and `done` are the state move's now
//! (`state::journal`), and stay the files an older build reads.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::rules::Rule;

/// The folder at the data dir's top every launch move keeps its records in.
pub const DIR: &str = ".library-move";
const JOURNAL: &str = "journal.drive.json";
/// The journal's name before the state move took it.
const OLDER_JOURNAL: &str = "journal.json";
const DONE_LOG: &str = "done.log";
const LOCK: &str = "lock";
/// This move's own marker, holding `DONE`.
const MARKER: &str = "drive";
const DONE: &str = "done";
/// The marker every build reads first. It held `LAYOUT` once this move was
/// over, until the state move wrote its own word there.
const SHARED_MARKER: &str = "done";

/// What `done` held when this move was the latest one.
pub const LAYOUT: &str = "drive";

/// The journal's own format, so a resumed run never reads one it does not
/// understand.
const FORMAT: u32 = 1;

/// What a step is for, for the summary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Kind {
    /// An empty staging or `.claude` folder, deleted.
    Debris,
    /// A synced folder or file into `Course/`.
    Synced,
    /// A video (and its captions) out of `Files/` into `Media/`.
    Media,
    /// A parse record or page vectors into `.oculus/derived/`.
    Derived,
    /// A student's file or folder out of its kind's folder to the root.
    Own,
    /// A notes folder's pictures folder, to its hidden name.
    NoteAssets,
    /// A lecture recording into `Course/Recordings/`.
    Recording,
    /// The subject's agent folder into `.oculus/agents/`.
    Agents,
    /// Something an agent wrote, into the subject's `Agent notes/`.
    AgentNotes,
    /// A lecture download cut short (`raw*.mp4`), deleted.
    Partial,
    /// An old folder left empty, or a stale link, removed.
    Cleanup,
    /// A `.canvas` drawing renamed to `.whiteboard` (`whiteboard`).
    Whiteboard,
    /// A drawing's page pictures or recovery drafts, to their folder's
    /// whiteboard name (`whiteboard`).
    DrawingRecords,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Op {
    /// `std::fs::rename`, creating the new parent first.
    Rename { from: String, to: String },
    /// A folder holding only folders, deleted; one holding a file is left.
    RemoveEmptyTree { path: String },
    /// A file or a symlink.
    RemoveFile { path: String },
    /// A folder, once nothing but `.DS_Store` is left in it.
    RemoveDirIfEmpty { path: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Step {
    pub kind: Kind,
    #[serde(flatten)]
    pub op: Op,
    #[serde(default)]
    pub done: bool,
}

/// A markdown file that moved: its relative links are re-pointed from where
/// it is now (`notes`), or a parse record whose PDF took a new name on a
/// clash (`renamed`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Moved {
    pub old: String,
    pub new: String,
}

/// A lecture's recording folder: from `lectures/<id>/` to `folder_rel`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LectureMove {
    pub id: String,
    pub folder_rel: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// Steps still to do.
    Moving,
    /// Every step done; the database and file contents still to rewrite.
    Moved,
}

/// The whole move, decided before the first rename.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Plan {
    pub format: u32,
    pub phase: Phase,
    pub steps: Vec<Step>,
    pub rules: Vec<Rule>,
    /// Every markdown file that moved.
    pub notes: Vec<Moved>,
    /// Parse records whose PDF was renamed: the record's new path, and the
    /// PDF's old and new names.
    pub renamed_records: Vec<(String, Moved)>,
    pub lectures: Vec<LectureMove>,
    /// Subject folders whose agent link to their memories is remade.
    pub relink: Vec<String>,
    /// What stays where it is, with why, said once in the log.
    pub left: Vec<String>,
}

impl Default for Plan {
    fn default() -> Self {
        Self {
            format: FORMAT,
            phase: Phase::Moving,
            steps: Vec::new(),
            rules: Vec::new(),
            notes: Vec::new(),
            renamed_records: Vec::new(),
            lectures: Vec::new(),
            relink: Vec::new(),
            left: Vec::new(),
        }
    }
}

impl Plan {
    /// Nothing to move, delete or rewrite: a library already in this layout,
    /// or a new one.
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty() && self.rules.is_empty() && self.lectures.is_empty()
    }

    /// Steps per kind, for the summary.
    pub fn counts(&self) -> BTreeMap<Kind, usize> {
        let mut counts = BTreeMap::new();
        for step in &self.steps {
            *counts.entry(step.kind).or_default() += 1;
        }
        counts
    }
}

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join(DIR)
}

fn journal_path(data_dir: &Path) -> PathBuf {
    dir(data_dir).join(JOURNAL)
}

fn done_log_path(data_dir: &Path) -> PathBuf {
    dir(data_dir).join(DONE_LOG)
}

/// What `done` says, trimmed; `None` when there is none.
pub fn marker(data_dir: &Path) -> Option<String> {
    std::fs::read_to_string(dir(data_dir).join(SHARED_MARKER))
        .ok()
        .map(|s| s.trim().to_string())
}

pub fn write_marker(data_dir: &Path, word: &str) -> Result<(), String> {
    write_file(data_dir, SHARED_MARKER, word)
}

fn write_file(data_dir: &Path, name: &str, body: &str) -> Result<(), String> {
    let path = dir(data_dir).join(name);
    std::fs::create_dir_all(dir(data_dir)).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    crate::runtime::atomic_write::write(&path, &tmp, body.as_bytes())
}

/// True once this move has finished here (or found nothing to do): by its
/// own marker, or by `done` as a build from before the state move left it.
pub fn is_done(data_dir: &Path) -> bool {
    std::fs::read_to_string(dir(data_dir).join(MARKER)).is_ok_and(|s| s.trim() == DONE)
        || marker(data_dir).as_deref() == Some(LAYOUT)
}

pub fn mark_done(data_dir: &Path) -> Result<(), String> {
    write_file(data_dir, MARKER, DONE)
}

/// Before the state move takes `journal.json` and `done`: this move's
/// journal, as an older build left it (finished or cut short), goes to its
/// new name, and a finished move gets its own marker. A `journal.json` that
/// is the state move's own (a guard cut short) is left for it to replace.
pub fn step_aside(data_dir: &Path) -> Result<(), String> {
    if marker(data_dir).as_deref() == Some(LAYOUT) {
        mark_done(data_dir)?;
    }
    let (older, kept) = (dir(data_dir).join(OLDER_JOURNAL), journal_path(data_dir));
    let Ok(raw) = std::fs::read(&older) else {
        return Ok(());
    };
    let format = serde_json::from_slice::<serde_json::Value>(&raw)
        .ok()
        .and_then(|journal| journal.get("format")?.as_u64());
    if format != Some(u64::from(FORMAT)) {
        return Ok(());
    }
    if kept.exists() {
        return Err(format!(
            "{} and {} are both the Drive move's journal; remove the older one",
            older.display(),
            kept.display()
        ));
    }
    std::fs::rename(&older, &kept).map_err(|e| format!("keep {}: {e}", older.display()))
}

/// Held for the whole move; another process blocks here until it is done.
pub fn lock(data_dir: &Path) -> Result<keyd_core::platform::files::FileLock, String> {
    std::fs::create_dir_all(dir(data_dir)).map_err(|e| e.to_string())?;
    let path = dir(data_dir).join(LOCK);
    keyd_core::platform::files::lock(&path).map_err(|e| format!("lock {}: {e}", path.display()))
}

/// The plan an interrupted run left, with the steps it logged as done since
/// marked.
pub fn load(data_dir: &Path) -> Result<Option<Plan>, String> {
    let Some(mut plan) = load_at(&journal_path(data_dir))? else {
        return Ok(None);
    };
    if let Ok(log) = std::fs::read_to_string(done_log_path(data_dir)) {
        for index in log.lines().filter_map(|l| l.trim().parse::<usize>().ok()) {
            if let Some(step) = plan.steps.get_mut(index) {
                step.done = true;
            }
        }
    }
    Ok(Some(plan))
}

/// The journal at `path`, refused when its format is not this reader's.
pub fn load_at(path: &Path) -> Result<Option<Plan>, String> {
    let raw = match std::fs::read(path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    let plan: Plan =
        serde_json::from_slice(&raw).map_err(|e| format!("read {}: {e}", path.display()))?;
    if plan.format != FORMAT {
        return Err(format!(
            "{} is from another version of Oculus (format {})",
            path.display(),
            plan.format
        ));
    }
    Ok(Some(plan))
}

/// Write the plan whole, and start the done log over: what it held is in
/// the plan's states now.
pub fn save(data_dir: &Path, plan: &Plan) -> Result<(), String> {
    crate::runtime::atomic_write::json(&journal_path(data_dir), plan)?;
    match std::fs::remove_file(done_log_path(data_dir)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("clear the done log: {e}")),
    }
}

/// Appends step indices to `done.log` as they land, synced each time: a
/// crash loses at most the step in flight, which the resumed run finds done
/// on disk.
pub struct DoneLog(std::fs::File);

impl DoneLog {
    pub fn open(data_dir: &Path) -> Result<Self, String> {
        Self::open_at(&done_log_path(data_dir))
    }

    pub fn open_at(path: &Path) -> Result<Self, String> {
        std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .map(Self)
            .map_err(|e| format!("open {}: {e}", path.display()))
    }

    pub fn record(&mut self, index: usize) -> Result<(), String> {
        writeln!(self.0, "{index}")
            .and_then(|()| self.0.sync_data())
            .map_err(|e| format!("write the done log: {e}"))
    }
}
