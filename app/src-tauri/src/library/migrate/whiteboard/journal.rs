//! The rename's record, beside the Drive move's in `<data dir>/.library-move/`
//! and under the same lock: its plan (`whiteboard.json`), the steps done
//! since it was written (`whiteboard.log`), and its own marker
//! (`whiteboard`), so a build from before the rename still finds the Drive
//! move's marker as it left it.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::library::migrate::journal::{dir, Kind, Op, Phase, Step};
use crate::library::migrate::rules::Rule;

const JOURNAL: &str = "whiteboard.json";
const DONE_LOG: &str = "whiteboard.log";
const MARKER: &str = "whiteboard";
const DONE: &str = "done";

/// The journal's own format, so a resumed run never reads one it does not
/// understand.
const FORMAT: u32 = 1;

/// The whole rename, decided before the first step.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Plan {
    pub format: u32,
    pub phase: Phase,
    pub steps: Vec<Step>,
    /// Each drawing's old path and new one, data-dir-relative; a `files` row
    /// whose drawing is gone has one too.
    pub rules: Vec<Rule>,
    /// Some `files` row still has the old category, whatever its file is.
    pub recategorize: bool,
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
            recategorize: false,
            left: Vec::new(),
        }
    }
}

impl Plan {
    pub fn is_empty(&self) -> bool {
        self.steps.is_empty() && self.rules.is_empty() && !self.recategorize
    }

    pub fn counts(&self) -> BTreeMap<Kind, usize> {
        let mut counts = BTreeMap::new();
        for step in &self.steps {
            *counts.entry(step.kind).or_default() += 1;
        }
        counts
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
    plan.steps.iter_mut().for_each(follow_state_move);
    Ok(Some(plan))
}

/// The records folders as a build from before the state folder named them,
/// at the data dir's top.
const AT_THE_TOP: [&str; 3] = ["canvas-pages", "whiteboard-pages", "recovery"];

/// A journal such a build left cut short names those folders where they
/// were; the state move, which runs first, has put them in the state folder.
fn follow_state_move(step: &mut Step) {
    let moved = |path: &mut String| {
        let top = path.split('/').next().unwrap_or_default();
        if AT_THE_TOP.contains(&top) {
            *path = crate::library::paths::state_rel(path);
        }
    };
    match &mut step.op {
        Op::Rename { from, to } => {
            moved(from);
            moved(to);
        }
        Op::RemoveEmptyTree { path } | Op::RemoveFile { path } | Op::RemoveDirIfEmpty { path } => {
            moved(path)
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Scratch;

    #[test]
    fn a_journal_from_before_the_state_folder_follows_its_records_into_it() {
        let dir = Scratch::new("whiteboard-journal-older");
        let step = |op: Op| Step {
            kind: Kind::DrawingRecords,
            op,
            done: false,
        };
        let rename = |from: &str, to: &str| Op::Rename {
            from: from.into(),
            to: to.into(),
        };
        let plan = Plan {
            steps: vec![
                step(rename("canvas-pages", "whiteboard-pages")),
                step(rename(
                    "recovery/canvases/1.json",
                    "recovery/whiteboards/1.json",
                )),
                step(Op::RemoveDirIfEmpty {
                    path: "recovery/canvases".into(),
                }),
                step(rename("courses/X/a.canvas", "courses/X/a.whiteboard")),
            ],
            ..Plan::default()
        };
        save(&dir, &plan).unwrap();
        let ops: Vec<Op> = load(&dir)
            .unwrap()
            .unwrap()
            .steps
            .into_iter()
            .map(|s| s.op)
            .collect();
        assert_eq!(
            ops,
            [
                rename(".oculus/canvas-pages", ".oculus/whiteboard-pages"),
                rename(
                    ".oculus/recovery/canvases/1.json",
                    ".oculus/recovery/whiteboards/1.json"
                ),
                Op::RemoveDirIfEmpty {
                    path: ".oculus/recovery/canvases".into()
                },
                rename("courses/X/a.canvas", "courses/X/a.whiteboard"),
            ]
        );
    }
}
