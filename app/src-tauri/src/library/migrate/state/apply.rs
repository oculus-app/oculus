//! Carrying out the renames, the journal saved as each lands. Every step can
//! run again: a source that is gone has moved already (or was a write-ahead
//! file SQLite removed). Moving is `rename` only, and a target that exists
//! is an error naming both paths: nothing is merged or overwritten.

use std::io;
use std::path::Path;

use super::journal::{self, Journal};
use super::names::DATABASE;

/// Test seams: stop after this many renames (a crash), or fail one.
#[derive(Clone, Debug, Default)]
pub struct Hooks {
    pub stop_after: Option<usize>,
    pub fail_at: Option<usize>,
}

impl Hooks {
    /// A debug build stops after N renames when this is set, so a run on a
    /// copied library can be cut short and resumed. Release builds ignore it.
    pub const STOP_AFTER_ENV: &str = "OCULUS_STATE_MOVE_STOP_AFTER";

    pub fn from_env() -> Self {
        if !cfg!(debug_assertions) {
            return Self::default();
        }
        Self {
            stop_after: std::env::var(Self::STOP_AFTER_ENV)
                .ok()
                .and_then(|v| v.parse().ok()),
            fail_at: None,
        }
    }
}

/// What stopped a run before every step was done.
pub const STOPPED: &str = "the move stopped early (test hook); run again to finish it";

/// A target the plan would land on that is already there, before anything
/// is written: the refusal then leaves the folder exactly as it was.
pub fn taken(data_dir: &Path, journal: &Journal) -> Option<String> {
    journal
        .moves
        .iter()
        .filter(|step| !step.done && exists(&data_dir.join(&step.from)))
        .find(|step| exists(&data_dir.join(&step.to)))
        .map(|step| clash(data_dir, &step.from, &step.to))
}

fn exists(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

fn clash(data_dir: &Path, from: &str, to: &str) -> String {
    format!(
        "cannot move {} to {}: something is already there. Oculus never merges or overwrites; \
         move one of the two aside and open Oculus again",
        data_dir.join(from).display(),
        data_dir.join(to).display()
    )
}

pub async fn execute(data_dir: &Path, journal: &mut Journal, hooks: &Hooks) -> Result<(), String> {
    let mut renamed = 0;
    for index in 0..journal.moves.len() {
        if journal.moves[index].done {
            continue;
        }
        let (from, to) = (
            journal.moves[index].from.clone(),
            journal.moves[index].to.clone(),
        );
        let source = data_dir.join(&from);
        if exists(&source) {
            if hooks.stop_after == Some(renamed) {
                return Err(STOPPED.to_string());
            }
            if exists(&data_dir.join(&to)) {
                return Err(clash(data_dir, &from, &to));
            }
            // Again, right before it moves: the first check was before the guard.
            if from == DATABASE {
                super::alone::checkpoint(&source).await?;
            }
            let fake = (hooks.fail_at == Some(renamed)).then(|| io::Error::other("test hook"));
            rename(data_dir, &from, &to, fake)?;
            renamed += 1;
        }
        journal.moves[index].done = true;
        journal::save(data_dir, journal)?;
    }
    Ok(())
}

fn rename(data_dir: &Path, from: &str, to: &str, fake: Option<io::Error>) -> Result<(), String> {
    let (source, target) = (data_dir.join(from), data_dir.join(to));
    let renamed = match fake {
        Some(e) => Err(e),
        None => std::fs::rename(&source, &target),
    };
    renamed.map_err(|e| {
        let (source, target) = (source.display(), target.display());
        if e.kind() == io::ErrorKind::CrossesDevices {
            format!(
                "cannot move {source} to {target}: they are on different volumes. Oculus moves \
                 its files only by renaming, never by copying, so nothing was copied; keep the \
                 whole data folder on one volume and open Oculus again"
            )
        } else {
            format!("cannot move {source} to {target}: {e}")
        }
    })
}
