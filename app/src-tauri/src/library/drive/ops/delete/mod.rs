//! `delete_entries`: the student's own files and folders go to the system
//! Trash (`bin`), in two steps, so the toast's Undo is exact. `send` moves
//! each entry to the Trash at once and keeps it pending: its rows, pages,
//! links and the app's own records of it (parse artifacts, a converted PDF,
//! a folder's derived records) stay as they were. `finish` makes it final:
//! the rows and those records go, as a delete always did. `undo` moves it
//! back out of the Trash, under the next free name when its place was
//! taken, so nothing is parsed again. While pending, its names are held
//! (`held`: nothing Drive makes takes them) and its leftovers are hidden
//! from listings (`hides`). docs/frontend.md has the contract.

mod bin;
pub mod commands;
mod finish;
mod send;
mod undo;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub use bin::{Bin, SystemBin};
pub use finish::finish_at;
pub use send::{send_at, Sent};
pub use undo::undo_at;

/// One entry sent to the Trash.
#[derive(Debug, Clone)]
pub struct Item {
    /// Where it was, data-dir-relative, and on disk.
    pub rel: String,
    pub path: PathBuf,
    pub dir: bool,
    /// Where the Trash put it.
    pub trashed: PathBuf,
    /// Its `files` rows.
    pub ids: Vec<i64>,
    /// The app's own files of it, removed when the delete is final.
    pub leftovers: Vec<PathBuf>,
}

/// One delete waiting for its toast to close.
#[derive(Debug)]
pub struct Pending {
    pub id: u64,
    pub data_dir: PathBuf,
    pub items: Vec<Item>,
}

static PENDING: Mutex<Vec<Pending>> = Mutex::new(Vec::new());

fn registry() -> std::sync::MutexGuard<'static, Vec<Pending>> {
    PENDING.lock().unwrap_or_else(|e| e.into_inner())
}

/// A path as the volume compares it: Unicode NFC, case folded.
fn key(path: &Path) -> String {
    use unicode_normalization::UnicodeNormalization;
    path.to_string_lossy()
        .nfc()
        .collect::<String>()
        .to_uppercase()
        .to_lowercase()
}

/// True when `path` is a pending entry's place, or inside one, or one of its
/// leftovers: a name nothing may take until the delete is final or undone.
pub fn held(path: &Path) -> bool {
    let wanted = key(path);
    registry().iter().flat_map(|p| &p.items).any(|item| {
        let at = key(&item.path);
        wanted == at
            || wanted.starts_with(&format!("{at}/"))
            || item.leftovers.iter().any(|l| key(l) == wanted)
    })
}

/// True for a pending entry's leftover, which a listing leaves out: with
/// its file in the Trash it would read as a file of its own.
pub fn hides(path: &Path) -> bool {
    let wanted = key(path);
    registry()
        .iter()
        .flat_map(|p| &p.items)
        .any(|item| item.leftovers.iter().any(|l| key(l) == wanted))
}

fn keep(pending: Pending) {
    registry().push(pending);
}

/// The pending delete `id`, taken out: `None` once it was finished or undone.
fn take(id: u64) -> Option<Pending> {
    let mut all = registry();
    let at = all.iter().position(|p| p.id == id)?;
    Some(all.remove(at))
}

/// Every pending delete of the library at `data_dir`, taken out.
fn take_all_in(data_dir: &Path) -> Vec<Pending> {
    let mut all = registry();
    let (mine, rest) = all.drain(..).partition(|p| p.data_dir == data_dir);
    *all = rest;
    mine
}
