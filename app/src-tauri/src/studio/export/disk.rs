//! The export's files on disk. Each is written beside its destination under a
//! hidden temporary name and renamed over it, so a player with the old file
//! open keeps reading it and nobody sees a half-written one. The temporary
//! name is the link's (`temp_name`), so one a crash left is replaced by the
//! link's next export into that folder; a dot-name, Drive never lists or
//! rows it.

use std::path::{Path, PathBuf};

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

/// The hidden name the export of `slug`'s `preset` writes `slot` (`mp4` or
/// `vtt`) under before the rename.
pub fn temp_name(slug: &str, preset: &str, slot: &str) -> String {
    format!(".oculus-export-{slug}-{preset}.{slot}")
}

/// Copy `from` to `to` (an APFS clone where the volume allows) through the
/// hidden `temp` beside it, replacing whatever is there by a rename. Returns
/// the size written.
pub fn place(from: &Path, to: &Path, temp: &str) -> std::io::Result<u64> {
    let folder = to.parent().unwrap_or(Path::new("."));
    let temp = folder.join(temp);
    remove(&temp)?;
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
    let taken = |n: &str| names::is_taken(&dir.join(n));
    names::free_name_where(name, false, |c| !taken(c) && !taken(&captions_of(c)))
}

/// The size and modification time (Unix ms) of the file at `path`.
pub fn stamp(path: &Path) -> std::io::Result<(i64, i64)> {
    let meta = std::fs::symlink_metadata(path)?;
    let modified_ms = meta
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);
    Ok((meta.len() as i64, modified_ms))
}

/// Remove the file at `path` if it is there.
pub fn remove(path: &Path) -> std::io::Result<bool> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}
