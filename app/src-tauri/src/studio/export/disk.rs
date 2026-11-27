//! The export's files on disk. Each is written beside its destination under a
//! hidden temporary name and renamed over it, so a player with the old file
//! open keeps reading it and nobody sees a half-written one.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::library::drive::ops::names;

/// The render being exported: its mp4 in `renders/` and, for a narrated
/// video, the captions beside it.
pub struct Render {
    pub mp4: PathBuf,
    pub captions: Option<PathBuf>,
}

/// `<name>.vtt`: where a video's captions sit in Drive, as the player and
/// Transcribe have them.
pub fn captions_of(rel: &str) -> String {
    format!("{rel}.vtt")
}

/// Copy `from` to `to` (an APFS clone where the volume allows), replacing
/// whatever is there by a rename. Returns the size written.
pub fn place(from: &Path, to: &Path) -> std::io::Result<u64> {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let folder = to.parent().unwrap_or(Path::new("."));
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let temp = folder.join(format!(".oculus-export-{}-{n}", std::process::id()));
    let size = std::fs::copy(from, &temp).inspect_err(|_| {
        let _ = std::fs::remove_file(&temp);
    })?;
    std::fs::rename(&temp, to).inspect_err(|_| {
        let _ = std::fs::remove_file(&temp);
    })?;
    Ok(size)
}

/// `name`, else `stem (2).mp4`…: the first one in `dir` free for the video
/// and for its captions beside it.
pub fn free_name(dir: &Path, name: &str) -> String {
    let taken = |n: &str| std::fs::symlink_metadata(dir.join(n)).is_ok();
    names::free_name_where(name, false, |c| !taken(c) && !taken(&captions_of(c)))
}

/// Remove the file at `path` if it is there.
pub fn remove(path: &Path) -> std::io::Result<bool> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}
