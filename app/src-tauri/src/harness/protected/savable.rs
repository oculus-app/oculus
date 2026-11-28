//! Which files in the agents' workspace the student may keep in Drive: what
//! an agent made for them (`outputs/`, a working file at the top) and what
//! they attached, never the app's or the agent's own files (`WORKSPACE_DIRS`,
//! `AGENT_DIRS`, `WORKSPACE_FILES`, any dot-name).
//!
//! The path comes from a reply, so from model output: it is resolved here on
//! disk, with no symlink followed and no `..`, and the resolved path is
//! checked again. A file with a second hard link is refused, since its other
//! name may be one of the agent's own. On unix the file is reached by opening
//! each step from the data dir with `O_NOFOLLOW` (`open_unlinked`), and
//! `Savable::read` reads only a handle that is the very file this answer saw,
//! so a file or folder swapped for a link meanwhile reads nothing.

use std::fs::{File, Metadata};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use super::{AGENT_DIRS, WORKSPACE_DIRS, WORKSPACE_FILES};

/// The largest chat output a save copies: the copy is made in memory.
pub const MAX_SAVE_BYTES: u64 = 512 * 1024 * 1024;

/// A file the student may keep, resolved on disk.
#[derive(Debug)]
pub struct Savable {
    /// Canonical: no symlink, no `..`.
    pub path: PathBuf,
    pub stamp: SourceStamp,
    /// How it was reached, for `read` to reach it the same way again.
    root: PathBuf,
    rel: String,
    /// The file this answer saw, which `read`'s handle must be.
    seen: Metadata,
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
    let meta = open_unlinked(data_dir, rel)?.metadata().ok()?;
    if !meta.is_file() || other_names(&meta) {
        return None;
    }
    let walked = data_dir.join(rel);
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
        root: data_dir.to_path_buf(),
        rel: rel.to_string(),
        seen: meta,
    })
}

impl Savable {
    /// The file's bytes and their stamp, read through a handle that is
    /// checked to be the very file `savable` resolved: reached again without
    /// following a link, still a regular file with one name, the same inode
    /// as the one `savable` saw (never a fresh lookup of the path). At most
    /// `MAX_SAVE_BYTES`.
    pub fn read(&self) -> Result<(Vec<u8>, SourceStamp), String> {
        let refused = || "That file can't be saved to Drive.".to_string();
        let file = open_unlinked(&self.root, &self.rel).ok_or_else(refused)?;
        let open = file.metadata().map_err(|_| refused())?;
        if !open.is_file() || other_names(&open) || !same_file(&open, &self.seen) {
            return Err(refused());
        }
        if open.len() > MAX_SAVE_BYTES {
            return Err(too_large());
        }
        let mut bytes = Vec::with_capacity(open.len() as usize);
        file.take(MAX_SAVE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| format!("could not read it — {e}"))?;
        if bytes.len() as u64 > MAX_SAVE_BYTES {
            return Err(too_large());
        }
        Ok((bytes, SourceStamp::of(&open)))
    }
}

fn too_large() -> String {
    format!(
        "That file is larger than {} MB, too large to save to Drive from a chat.",
        MAX_SAVE_BYTES / (1024 * 1024)
    )
}

/// `rel` under `root`, each step opened from the last with `O_NOFOLLOW`, so
/// no link anywhere along it is followed and no step is looked up twice.
/// `O_NONBLOCK` keeps a FIFO from blocking the open; callers want a file.
#[cfg(unix)]
fn open_unlinked(root: &Path, rel: &str) -> Option<File> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    let open_at = |dir: &OwnedFd, name: &str, flags: libc::c_int| -> Option<OwnedFd> {
        let name = CString::new(name).ok()?;
        let flags = flags | libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_CLOEXEC;
        // SAFETY: `dir` is an open descriptor and `name` a NUL-terminated
        // string, both alive for the call; a non-negative result is a new
        // descriptor this function alone owns.
        let fd = unsafe { libc::openat(dir.as_raw_fd(), name.as_ptr(), flags) };
        // SAFETY: as above, `fd` is fresh and owned by nothing else.
        (fd >= 0).then(|| unsafe { OwnedFd::from_raw_fd(fd) })
    };
    let (last, folders) = rel
        .split('/')
        .collect::<Vec<_>>()
        .split_last()
        .map(|(l, f)| (*l, f.to_vec()))?;
    let mut dir: OwnedFd = File::open(root).ok()?.into();
    for part in folders {
        dir = open_at(&dir, part, libc::O_DIRECTORY)?;
    }
    open_at(&dir, last, libc::O_NONBLOCK).map(File::from)
}

/// Without `openat`, each step is checked not to be a link before the open.
#[cfg(not(unix))]
fn open_unlinked(root: &Path, rel: &str) -> Option<File> {
    let mut walked = root.to_path_buf();
    for part in rel.split('/') {
        walked.push(part);
        if std::fs::symlink_metadata(&walked)
            .ok()?
            .file_type()
            .is_symlink()
        {
            return None;
        }
    }
    File::open(&walked).ok()
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
