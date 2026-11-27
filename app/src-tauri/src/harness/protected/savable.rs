//! Which files in the agents' workspace the student may keep in Drive: what
//! an agent made for them (`outputs/`, a working file at the top) and what
//! they attached, never the app's or the agent's own files (`WORKSPACE_DIRS`,
//! `AGENT_DIRS`, `WORKSPACE_FILES`, any dot-name).
//!
//! The path comes from a reply, so from model output: it is resolved here on
//! disk, with no symlink followed and no `..`, and the resolved path is
//! checked again. A file with a second hard link is refused, since its other
//! name may be one of the agent's own. `Savable::read` checks once more, on
//! the open file, so a swap after this answer reads nothing.

use std::fs::Metadata;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use super::{AGENT_DIRS, WORKSPACE_DIRS, WORKSPACE_FILES};

/// A file the student may keep, resolved on disk.
#[derive(Debug)]
pub struct Savable {
    /// Canonical: no symlink, no `..`.
    pub path: PathBuf,
    pub stamp: SourceStamp,
}

/// The source's size and modification time when it was looked at: a saved
/// copy stands for the file only while these still match, since an agent
/// reuses `outputs/` names.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStamp {
    pub size: u64,
    pub modified_ms: i64,
}

impl SourceStamp {
    fn of(meta: &Metadata) -> Self {
        let modified_ms = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_millis() as i64);
        Self {
            size: meta.len(),
            modified_ms,
        }
    }
}

/// `rel` (data-dir-relative, `.oculus/agents/…`) as a file the student may
/// save, or `None`: outside the workspace, one of the app's or the agent's
/// own, through a symlink, not a regular file, or hard-linked elsewhere.
pub fn savable(data_dir: &Path, rel: &str) -> Option<Savable> {
    let inner = rel.strip_prefix(&format!("{}/", crate::agents::agents_rel()))?;
    let parts: Vec<&str> = inner.split('/').collect();
    if !parts.iter().all(|p| plain(p)) || agents_own(&parts) {
        return None;
    }
    // Every step from the data dir, the workspace's own folders included,
    // must be a real entry and not a link.
    let mut walked = data_dir.to_path_buf();
    for part in rel.split('/') {
        walked.push(part);
        let meta = std::fs::symlink_metadata(&walked).ok()?;
        if meta.file_type().is_symlink() {
            return None;
        }
    }
    let meta = std::fs::symlink_metadata(&walked).ok()?;
    if !meta.is_file() || other_names(&meta) {
        return None;
    }
    // The disk's own spelling, checked again: a case variant of a folder
    // name (`Memories/`) reaches the same folder on a case-blind volume.
    let path = walked.canonicalize().ok()?;
    let workspace = crate::agents::agents_dir(data_dir).canonicalize().ok()?;
    let real: Vec<&str> = path
        .strip_prefix(&workspace)
        .ok()?
        .components()
        .map(|c| match c {
            Component::Normal(name) => name.to_str(),
            _ => None,
        })
        .collect::<Option<_>>()?;
    if real.is_empty() || agents_own(&real) {
        return None;
    }
    Some(Savable {
        path,
        stamp: SourceStamp::of(&meta),
    })
}

impl Savable {
    /// The file's bytes and their stamp, read through a handle that is
    /// checked to be the very file `savable` resolved: opened without
    /// following a link, still a regular file with one name, the same inode.
    pub fn read(&self) -> Result<(Vec<u8>, SourceStamp), String> {
        let refused = || "That file can't be saved to Drive.".to_string();
        let mut options = std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW);
        }
        let mut file = options.open(&self.path).map_err(|_| refused())?;
        let open = file.metadata().map_err(|_| refused())?;
        let named = std::fs::symlink_metadata(&self.path).map_err(|_| refused())?;
        if !open.is_file() || other_names(&open) || !same_file(&open, &named) {
            return Err(refused());
        }
        let mut bytes = Vec::with_capacity(open.len() as usize);
        file.read_to_end(&mut bytes)
            .map_err(|e| format!("could not read it — {e}"))?;
        Ok((bytes, SourceStamp::of(&open)))
    }
}

/// A plain name: not empty, `.` or `..`, and no separator of another
/// platform or NUL.
fn plain(part: &str) -> bool {
    !part.is_empty() && part != "." && part != ".." && !part.contains(['\\', '\0', ':'])
}

/// Inside-the-workspace segments naming the app's or the agent's own file:
/// any dot-name (the CLIs' folders), a folder of `WORKSPACE_DIRS` or
/// `AGENT_DIRS`, or a file of `WORKSPACE_FILES` at the top. Without case.
fn agents_own(parts: &[&str]) -> bool {
    let is = |name: &str, list: &[&str]| list.iter().any(|n| n.eq_ignore_ascii_case(name));
    parts.iter().any(|p| p.starts_with('.'))
        || parts
            .first()
            .is_some_and(|first| is(first, &WORKSPACE_DIRS) || is(first, &AGENT_DIRS))
        || (parts.len() == 1 && is(parts[0], &WORKSPACE_FILES))
}

#[cfg(unix)]
fn other_names(meta: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    meta.nlink() > 1
}

#[cfg(not(unix))]
fn other_names(_meta: &Metadata) -> bool {
    false
}

#[cfg(unix)]
fn same_file(a: &Metadata, b: &Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    a.dev() == b.dev() && a.ino() == b.ino()
}

#[cfg(not(unix))]
fn same_file(a: &Metadata, b: &Metadata) -> bool {
    a.len() == b.len() && a.modified().ok() == b.modified().ok()
}

#[cfg(test)]
#[cfg(unix)]
mod tests;
