//! Files loose in `courses/`, beside the subject folders, move up to the data
//! dir's top, where the student's own files are listed and get rows; run at
//! launch after the other launch moves and with their lock.
//! docs/library-move.md describes it.
//!
//! 1. **Plan** (`plan`): each regular file directly in `courses/` (never a
//!    folder, a dot-name or a symlink) and what parsing made of it, under a
//!    name nothing at the top holds: `name (2).ext` on a clash, never an
//!    overwrite. Written to its own journal (`journal`).
//! 2. **Move** with `rename` only, through the Drive move's `apply`, each
//!    step logged as it lands; a crash resumes from the journal.
//! 3. **Record** each old path in `path_moves`, so a chat that cited one
//!    still opens it. Rows come from the top level's reconcile.

mod journal;
mod plan;

use std::path::Path;

pub use journal::Plan;

use super::apply::{self, Hooks};
use super::journal::{DoneLog, Phase};
use super::{record_moves, OwnRule};

#[derive(Debug)]
pub enum Outcome {
    /// An earlier run finished the move.
    AlreadyDone,
    /// Nothing loose in `courses/`.
    NothingToMove,
    /// How many files moved, what stayed, and whether a cut-short run was
    /// picked up.
    Moved {
        files: usize,
        left: Vec<String>,
        resumed: bool,
    },
}

/// The launch check, after the Drive move and the whiteboard rename. A
/// failure is logged, not fatal: every step is a rename, the library is
/// whole between any two, and the next launch resumes.
pub fn at_startup(data_dir: &Path) {
    if journal::is_done(data_dir) {
        return;
    }
    match run(data_dir, &Hooks::from_env()) {
        Ok(Outcome::Moved {
            files,
            left,
            resumed,
        }) => {
            let resumed = if resumed { " (resumed)" } else { "" };
            elog!(
                "[oculus] moved {files} files loose in courses/ to the top of the library{resumed}"
            );
            for left in &left {
                elog!("[oculus] loose files move left {left}");
            }
        }
        Ok(_) => {}
        Err(e) => elog!("[oculus] loose files move: {e}"),
    }
}

/// Run (or resume) the move. Blocks, on a thread and runtime of its own.
/// Refused until the Drive move is done: the plan reads the Drive tree.
pub fn run(data_dir: &Path, hooks: &Hooks) -> Result<Outcome, String> {
    let (data_dir, hooks) = (data_dir.to_path_buf(), hooks.clone());
    super::on_own_thread(move || async move { run_async(&data_dir, &hooks).await })
}

async fn run_async(data_dir: &Path, hooks: &Hooks) -> Result<Outcome, String> {
    let _lock = super::journal::lock(data_dir)?;
    if journal::is_done(data_dir) {
        return Ok(Outcome::AlreadyDone);
    }
    if !super::journal::is_done(data_dir) {
        return Err("the move into the Drive tree has not finished, so loose files wait".into());
    }
    let (mut plan, resumed) = match journal::load(data_dir)? {
        Some(plan) => (plan, true),
        None => {
            let plan = plan::build(data_dir);
            if plan.is_empty() {
                journal::mark_done(data_dir)?;
                return Ok(Outcome::NothingToMove);
            }
            journal::save(data_dir, &plan)?;
            (plan, false)
        }
    };
    if plan.phase == Phase::Moving {
        let log = DoneLog::open_at(&journal::done_log_path(data_dir))?;
        let moved = apply::execute(data_dir, &mut plan.steps, log, hooks);
        if moved.is_err() {
            journal::save(data_dir, &plan).ok();
        }
        moved?;
        plan.phase = Phase::Moved;
        journal::save(data_dir, &plan)?;
    }
    if let Some(pool) = super::open(data_dir, false).await? {
        super::db::ensure(&pool).await?;
        let renames: Vec<_> = plan
            .rules
            .iter()
            .map(|rule| (rule.clone(), OwnRule::Replace))
            .collect();
        let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
        record_moves(&mut conn, &renames).await?;
    }
    journal::mark_done(data_dir)?;
    Ok(Outcome::Moved {
        files: plan.steps.len(),
        left: plan.left.clone(),
        resumed,
    })
}
