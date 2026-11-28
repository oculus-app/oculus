//! The one-shot move of the app's own state from the data dir's top into
//! its hidden state folder (`library::paths::state_dir`), run at launch by
//! the app and the CLI before anything else opens a file there.
//! docs/library-move.md describes it.
//!
//! 1. **Plan** the renames from a fixed list of names (`names`).
//! 2. **Refuse**, having moved or created nothing, when a binary that is not
//!    the installed app was not told to move (`allowed`), a target is taken,
//!    or another process has the database open (`alone`).
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
pub(super) mod others;
pub(super) mod stray;

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

pub use alone::NOT_ALONE;
pub use apply::{Hooks, STOPPED};
pub use broker::{Broker, Registered};
pub use journal::{is_done, DONE, MOVING};
pub use others::Running;

use super::journal::Phase;
use crate::library::paths::{ensure_state_dir, state_rel};
use journal::{Journal, Move};

/// Any binary but the installed app moves a library only when this is `1`:
/// every checkout shares the one live data folder, and a build from a
/// checkout, debug or release, must never move it. The dev preflight sets it
/// in the main checkout (docs/development.md).
pub const ALLOW_ENV: &str = "OCULUS_STATE_MOVE";

/// What a run needs from outside: whether it may move at all, the broker,
/// the running processes, and the test hooks.
pub struct Env<'a> {
    pub allowed: bool,
    pub broker: &'a dyn Broker,
    /// Every process this user can see (`others::list`); tests pass a list.
    pub running: fn() -> Vec<Running>,
    pub hooks: Hooks,
}

/// Whether the binary at `exe` may move a library: the installed app always,
/// any other binary when `ALLOW_ENV` says so.
pub fn allowed(exe: &Path, var: Option<&str>) -> bool {
    installed(exe) || var == Some("1")
}

/// Whether `exe`, its real path with links resolved, is an installed app's:
/// in a macOS app bundle's `Contents/MacOS`, or in an MSIX package under
/// `WindowsApps`. A build tree's binary, debug or release, and a link to one
/// (the `cli:install` symlink on PATH) are not.
pub fn installed(exe: &Path) -> bool {
    let real = exe.canonicalize().unwrap_or_else(|_| exe.to_path_buf());
    if cfg!(windows) {
        real.components()
            .any(|c| c.as_os_str().eq_ignore_ascii_case("WindowsApps"))
    } else {
        keyd_core::paths::bundled_program(&real).is_some()
    }
}

/// This process's executable, for `allowed`.
fn this_exe() -> PathBuf {
    std::env::current_exe().unwrap_or_default()
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

/// Whether this library's own files were moved here into the state folder,
/// rather than made there: its journal lists the moves.
pub fn moved_here(data_dir: &Path) -> bool {
    journal::load(data_dir).is_ok_and(|j| !j.moves.is_empty())
}

/// The launch check: once the move is done, the state folder made sure of
/// and what an older build undid tidied (`stray`), else the whole move,
/// logged in one line.
pub fn at_startup(data_dir: &Path) -> Result<(), String> {
    if is_done(data_dir) {
        ensure_state_dir(data_dir)
            .map_err(|e| format!("create the state folder in {}: {e}", data_dir.display()))?;
        stray::tidy(
            data_dir,
            &chrono::Local::now().format("%Y-%m-%d").to_string(),
        );
        return Ok(());
    }
    let var = std::env::var(ALLOW_ENV).ok();
    let env = Env {
        allowed: allowed(&this_exe(), var.as_deref()),
        broker: &Registered,
        running: others::list,
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
         still at the top of {}, and this build keeps them in {}. Only the installed Oculus \
         app moves them on its own; any other build, a development build or a CLI built from \
         a checkout, moves them only when {ALLOW_ENV}=1 is set, because every checkout shares \
         this folder: quit Oculus everywhere, back the folder up, and open the installed app \
         or start the main checkout's `bun run tauri dev`, which sets it. Nothing was changed",
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

/// Why an unmoved library cannot move now, found without moving or creating
/// anything: a binary not told to, a target that is taken, another Oculus
/// running, or another process with the database open.
async fn refused(data_dir: &Path, env: &Env<'_>, journal: &Journal) -> Result<(), String> {
    if !env.allowed {
        return Err(refusal(data_dir));
    }
    if let Some(clash) = apply::taken(data_dir, journal) {
        return Err(clash);
    }
    if let Some(other) = others::another_oculus(&(env.running)(), std::process::id()) {
        return Err(format!("{NOT_ALONE} ({} is running)", other.exe.display()));
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
