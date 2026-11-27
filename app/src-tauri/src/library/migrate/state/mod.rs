//! The one-shot move of the app's own state from the data dir's top into
//! its hidden state folder (`library::paths::state_dir`), run at launch by
//! the app and the CLI before anything else opens a file there.
//! docs/library-move.md describes it.
//!
//! 1. **Plan** the renames from a fixed list of names (`names`).
//! 2. **Refuse, having changed nothing**, when a debug build was not told to
//!    move (`allowed`), a target is taken, or another process has the
//!    database open (`alone`).
//! 3. **Guard** (`journal`): from here a build from before this move
//!    refuses to start, and this one resumes.
//! 4. **Stop the broker**, **rename** (`apply`), **rewrite** (`after`),
//!    **register the broker** again (`broker`), and mark it done.

mod after;
mod alone;
mod apply;
mod broker;
mod journal;
mod names;

#[cfg(test)]
mod tests;

use std::path::Path;

pub use alone::NOT_ALONE;
pub use apply::{Hooks, STOPPED};
pub use broker::{Broker, Registered};
pub use journal::{is_done, DONE, MOVING};

use super::journal::Phase;
use crate::library::paths::{ensure_state_dir, state_rel};
use journal::{Journal, Move};

/// A debug build moves a library only when this is `1`: every checkout
/// shares the one live data folder, and a branch build must never move it.
/// The dev preflight sets it in the main checkout (docs/development.md).
pub const ALLOW_ENV: &str = "OCULUS_STATE_MOVE";

/// What a run needs from outside: whether it may move at all, the broker,
/// and the test hooks.
pub struct Env<'a> {
    pub allowed: bool,
    pub broker: &'a dyn Broker,
    pub hooks: Hooks,
}

/// Whether this build may move a library: a release always, a debug build
/// when `ALLOW_ENV` says so.
pub fn allowed(debug_build: bool, var: Option<&str>) -> bool {
    !debug_build || var == Some("1")
}

/// What a run did.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    AlreadyDone,
    /// Nothing of the app's at the top: a new install. The state folder and
    /// the guard are written all the same.
    NothingToMove,
    Moved(Summary),
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Summary {
    pub moved: usize,
    pub path_moves: usize,
    pub links: usize,
    /// The run picked up a journal an earlier one left.
    pub resumed: bool,
}

impl Summary {
    /// The one line the log prints.
    pub fn line(&self) -> String {
        let mut out = format!(
            "moved the app's own files into {}: {} entries, {} old-path rules kept, \
             {} subject links removed",
            crate::library::paths::STATE_DIR,
            self.moved,
            self.path_moves,
            self.links
        );
        if self.resumed {
            out.push_str(" (resumed)");
        }
        out
    }
}

/// The launch check: nothing but making sure the state folder exists once
/// the move is done, else the whole move, logged in one line.
pub fn at_startup(data_dir: &Path) -> Result<(), String> {
    if is_done(data_dir) {
        return ensure_state_dir(data_dir)
            .map(|_| ())
            .map_err(|e| format!("create the state folder in {}: {e}", data_dir.display()));
    }
    let var = std::env::var(ALLOW_ENV).ok();
    let env = Env {
        allowed: allowed(cfg!(debug_assertions), var.as_deref()),
        broker: &Registered,
        hooks: Hooks::from_env(),
    };
    if let Outcome::Moved(summary) = run(data_dir, &env)? {
        elog!("[oculus] {}", summary.line());
    }
    Ok(())
}

/// Run (or resume) the move. Blocks, on a runtime of its own.
pub fn run(data_dir: &Path, env: &Env) -> Result<Outcome, String> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?
                    .block_on(run_async(data_dir, env))
            })
            .join()
            .map_err(|_| "the state move panicked".to_string())?
    })
}

/// Every listed name that is at the top now, as a rename into the state folder.
fn plan(data_dir: &Path) -> Vec<Move> {
    names::MOVED
        .iter()
        .filter(|name| std::fs::symlink_metadata(data_dir.join(name)).is_ok())
        .map(|name| Move {
            from: name.to_string(),
            to: state_rel(name),
            done: false,
        })
        .collect()
}

fn refusal(data_dir: &Path) -> String {
    format!(
        "This library's own files (the database, the sign-in vault, the agents' folder) are \
         still at the top of {}, and this build keeps them in {}. A development build moves \
         them only when {ALLOW_ENV}=1 is set, because every checkout shares this folder: \
         quit Oculus everywhere, back the folder up, and start the main checkout's \
         `bun run tauri dev`, which sets it. Nothing was changed",
        data_dir.display(),
        crate::library::paths::state_dir(data_dir).display()
    )
}

/// An error after the guard: the library is part-moved and says where its
/// record is, and no build opens a fresh database over it.
fn part_moved(data_dir: &Path, error: String) -> String {
    format!(
        "{error}. The move is recorded in {} and resumes the next time Oculus opens",
        journal::path(data_dir).display()
    )
}

/// Why an unmoved library cannot move now, found without writing anything:
/// a debug build not told to, a target that is taken, or another process
/// with the database open.
async fn refused(data_dir: &Path, env: &Env<'_>, journal: &Journal) -> Result<(), String> {
    if !env.allowed {
        return Err(refusal(data_dir));
    }
    if let Some(clash) = apply::taken(data_dir, journal) {
        return Err(clash);
    }
    let database = data_dir.join(names::DATABASE);
    if database.is_file() {
        alone::checkpoint(&database).await?;
    }
    Ok(())
}

async fn run_async(data_dir: &Path, env: &Env<'_>) -> Result<Outcome, String> {
    // Once before the lock, whose folder and file would be a change of
    // their own, and again under it.
    match journal::marker(data_dir).as_deref() {
        None | Some(super::journal::LAYOUT) => {
            let journal = Journal::new(plan(data_dir));
            if !journal.moves.is_empty() {
                refused(data_dir, env, &journal).await?;
            }
        }
        Some(MOVING) if !env.allowed => return Err(refusal(data_dir)),
        _ => {}
    }
    let _lock = super::journal::lock(data_dir)?;
    // Another process may have finished it while this one waited.
    let (mut journal, resumed) = match journal::marker(data_dir).as_deref() {
        Some(DONE) => {
            ensure_state_dir(data_dir).map_err(|e| e.to_string())?;
            return Ok(Outcome::AlreadyDone);
        }
        Some(MOVING) if !env.allowed => return Err(refusal(data_dir)),
        Some(MOVING) => (journal::load(data_dir)?, true),
        None | Some(super::journal::LAYOUT) => {
            let journal = Journal::new(plan(data_dir));
            if journal.moves.is_empty() {
                ensure_state_dir(data_dir).map_err(|e| e.to_string())?;
                journal::guard(data_dir, &journal, DONE)?;
                return Ok(Outcome::NothingToMove);
            }
            refused(data_dir, env, &journal).await?;
            journal::guard(data_dir, &journal, MOVING)?;
            (journal, false)
        }
        Some(other) => {
            return Err(format!(
                "{} says `{other}`: a newer version of Oculus arranged this library, and this \
                 one cannot open it",
                super::journal::dir(data_dir).join("done").display()
            ));
        }
    };
    finish(data_dir, env, &mut journal, resumed)
        .await
        .map(Outcome::Moved)
        .map_err(|e| part_moved(data_dir, e))
}

async fn finish(
    data_dir: &Path,
    env: &Env<'_>,
    journal: &mut Journal,
    resumed: bool,
) -> Result<Summary, String> {
    if journal.phase == Phase::Moving {
        env.broker.stop(data_dir)?;
        ensure_state_dir(data_dir).map_err(|e| format!("create the state folder: {e}"))?;
        apply::execute(data_dir, journal, &env.hooks).await?;
        journal.phase = Phase::Moved;
        journal::save(data_dir, journal)?;
    }
    let path_moves = after::record_cited(data_dir).await?;
    let links = after::regenerate(data_dir)?;
    // Not fatal: the library is whole, and the app's launch installs keyd
    // again (`auth::keyd::ensure_installed`).
    if let Err(e) = env.broker.start(data_dir) {
        elog!("[oculus] state move: could not register keyd at its new paths: {e}");
    }
    after::remove_old_broker_files(data_dir);
    journal::mark(data_dir, DONE)?;
    Ok(Summary {
        moved: journal.moves.len(),
        path_moves,
        links,
        resumed,
    })
}
