//! The system Trash as a seam: the app's is `runtime::trash`; tests pass a
//! stand-in that moves into a scratch folder, so no test trashes anything.

use std::path::{Path, PathBuf};

pub trait Bin: Send + Sync {
    /// Move `path` to the Trash; where it went, when the platform says.
    fn put(&self, path: &Path) -> Result<Option<PathBuf>, String>;
}

/// The system's Trash (the Recycle Bin on Windows).
pub struct SystemBin;

impl Bin for SystemBin {
    fn put(&self, path: &Path) -> Result<Option<PathBuf>, String> {
        crate::runtime::trash::trash_item(path)
    }
}
