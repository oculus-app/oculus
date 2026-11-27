//! The move's record, beside the other launch moves' in
//! `<data dir>/.library-move/` and under the same lock: its plan
//! (`loose.json`), the steps done since it was written (`loose.log`), and its
//! own marker (`loose`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::library::migrate::journal::{dir, Phase, Step};
use crate::library::migrate::rules::Rule;

const JOURNAL: &str = "loose.json";
const DONE_LOG: &str = "loose.log";
const MARKER: &str = "loose";
const DONE: &str = "done";

/// The journal's own format, so a resumed run never reads one it does not
/// understand.
const FORMAT: u32 = 1;

/// The whole move, decided before the first rename.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Plan {
    pub format: u32,
    pub phase: Phase,
    pub steps: Vec<Step>,
    /// Each file's old path and new one, data-dir-relative, for `path_moves`.
    pub rules: Vec<Rule>,
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
            left: Vec::new(),
        }
    }
}

impl Plan {
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty()
    }
}

fn journal_path(data_dir: &Path) -> PathBuf {
    dir(data_dir).join(JOURNAL)
}

pub fn done_log_path(data_dir: &Path) -> PathBuf {
    dir(data_dir).join(DONE_LOG)
}

pub fn is_done(data_dir: &Path) -> bool {
    std::fs::read_to_string(dir(data_dir).join(MARKER)).is_ok_and(|s| s.trim() == DONE)
}

pub fn mark_done(data_dir: &Path) -> Result<(), String> {
    let path = dir(data_dir).join(MARKER);
    std::fs::create_dir_all(dir(data_dir)).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    crate::runtime::atomic_write::write(&path, &tmp, DONE.as_bytes())
}

/// The plan an interrupted run left, with the steps it logged as done since
/// marked.
pub fn load(data_dir: &Path) -> Result<Option<Plan>, String> {
    let path = journal_path(data_dir);
    let raw = match std::fs::read(&path) {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("read {}: {e}", path.display())),
    };
    let mut plan: Plan =
        serde_json::from_slice(&raw).map_err(|e| format!("read {}: {e}", path.display()))?;
    if plan.format != FORMAT {
        return Err(format!(
            "{} is from another version of Oculus (format {})",
            path.display(),
            plan.format
        ));
    }
    if let Ok(log) = std::fs::read_to_string(done_log_path(data_dir)) {
        for index in log.lines().filter_map(|l| l.trim().parse::<usize>().ok()) {
            if let Some(step) = plan.steps.get_mut(index) {
                step.done = true;
            }
        }
    }
    Ok(Some(plan))
}

/// Write the plan whole, and start the done log over.
pub fn save(data_dir: &Path, plan: &Plan) -> Result<(), String> {
    std::fs::create_dir_all(dir(data_dir)).map_err(|e| e.to_string())?;
    crate::runtime::atomic_write::json(&journal_path(data_dir), plan)?;
    match std::fs::remove_file(done_log_path(data_dir)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("clear the done log: {e}")),
    }
}
