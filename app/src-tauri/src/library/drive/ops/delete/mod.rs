//! `delete_entries`: the student's own files and folders go to the system
//! Trash (`bin`), in two steps, so the toast's Undo is exact. `send` moves
//! each entry to the Trash at once and keeps it pending: its rows, pages,
//! links and the app's own records of it (parse artifacts, a converted PDF,
//! a folder's derived records) stay as they were. `finish` makes it final:
//! the rows and those records go, as a delete always did, and the toast is
//! told (`final_event`), whatever made it final. `undo` moves it back out of
//! the Trash, under the next free name when its place was taken, so nothing
//! is parsed again. While pending, its names are held (`held`: nothing Drive
//! makes takes them, reconcile rows none of them), its leftovers are hidden
//! from listings (`hides`), and a move, rename or copy touching it makes it
//! final first (`finish_touching`). docs/frontend.md has the contract.

mod bin;
pub mod commands;
mod finish;
mod send;
mod undo;

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Emitter};

pub use bin::{Bin, SystemBin};
pub use finish::{finish_at, finish_touching};
pub use send::{put_back, send_at, send_with, Extras, Sent};
pub use undo::{undo_at, ALREADY_FINAL};

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

/// A file outside the library sent to the Trash with a delete (Studio's
/// render), which Undo puts back when its place is still free.
#[derive(Debug, Clone)]
pub struct Other {
    pub path: PathBuf,
    pub trashed: PathBuf,
}

/// Work a final delete does besides the rows: Studio forgets its render.
/// Each checks for itself that it still applies.
pub type Finally = Box<dyn FnOnce() + Send>;

/// One delete waiting for its toast to close.
pub struct Pending {
    pub id: u64,
    pub data_dir: PathBuf,
    pub items: Vec<Item>,
    pub others: Vec<Other>,
    pub finally: Vec<Finally>,
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

/// `path` is `at` or inside it, as keys.
fn within(path: &str, at: &str) -> bool {
    path == at || path.starts_with(&format!("{at}/"))
}

/// True when `path` is a pending entry's place or inside one, or one of its
/// leftovers or inside one: a name nothing may take, and nothing reconcile
/// may row, until the delete is final or undone.
pub fn held(path: &Path) -> bool {
    let wanted = key(path);
    registry().iter().flat_map(|p| &p.items).any(|item| {
        within(&wanted, &key(&item.path)) || item.leftovers.iter().any(|l| within(&wanted, &key(l)))
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
    take_where(|p| p.data_dir == data_dir)
}

/// The pending deletes of `data_dir` with an entry that is one of `paths`,
/// inside one or holds one (a folder renamed, moved or copied around it),
/// taken out.
fn take_touching(data_dir: &Path, paths: &[PathBuf]) -> Vec<Pending> {
    let paths: Vec<String> = paths.iter().map(|p| key(p)).collect();
    take_where(|p| {
        p.data_dir == data_dir
            && p.items.iter().any(|item| {
                let at = key(&item.path);
                paths
                    .iter()
                    .any(|path| within(path, &at) || within(&at, path))
            })
    })
}

fn take_where(pick: impl Fn(&Pending) -> bool) -> Vec<Pending> {
    let mut all = registry();
    let (picked, rest) = all.drain(..).partition(|p| pick(p));
    *all = rest;
    picked
}

/// The event a pending delete's toast closes on, with its handle.
pub const FINAL_EVENT: &str = "drive-delete-final";

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Give finished deletes a window to tell; a headless run never binds.
pub fn bind(app: AppHandle) {
    let _ = APP.set(app);
}

/// Tell the toast the delete `id` is final, whatever made it so.
fn final_event(id: u64) {
    if let Some(app) = APP.get() {
        if let Err(e) = app.emit(FINAL_EVENT, id) {
            elog!("[oculus] drive: could not announce a final delete: {e}");
        }
    }
}
