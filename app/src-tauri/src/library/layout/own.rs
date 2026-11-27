//! The student's own files: where each kind is created, and the guard every
//! command that writes, renames or deletes one runs.

use std::path::{Path, PathBuf};

use super::home::{child_rel, own_root, own_root_rel, TOP_LEVEL_CODE};
use super::roots::COURSES_DIR;
use super::shape::{Shape, CURRENT};
use super::zone::{same_name, segments, zone_of, Zone};

/// A file the student made or brought in.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OwnKind {
    Upload,
    Document,
    Whiteboard,
    Notebook,
}

impl OwnKind {
    /// The `files.category` its rows carry.
    pub fn category(self) -> &'static str {
        match self {
            Self::Upload => "upload",
            Self::Document => "document",
            Self::Whiteboard => "whiteboard",
            Self::Notebook => "notebook",
        }
    }

    /// The extension every file of this kind has; an upload can be anything.
    pub fn extension(self) -> Option<&'static str> {
        match self {
            Self::Upload => None,
            Self::Document => Some(".md"),
            Self::Whiteboard => Some(".whiteboard"),
            Self::Notebook => Some(".notebook"),
        }
    }

    /// The kind a file name says it is, wherever it sits.
    pub(super) fn by_extension(name: &str) -> Self {
        [Self::Document, Self::Whiteboard, Self::Notebook]
            .into_iter()
            .find(|k| k.extension().is_some_and(|ext| name.ends_with(ext)))
            .unwrap_or(Self::Upload)
    }
}

/// The folder a new file of `kind` lands in, on disk.
pub fn own_dir(data_dir: &Path, code: &str, kind: OwnKind) -> PathBuf {
    match CURRENT.own_dir(kind) {
        "" => own_root(data_dir, code),
        dir => own_root(data_dir, code).join(dir),
    }
}

/// Every file in a subject's own zone at any depth (for `TOP_LEVEL_CODE`,
/// the top level's: everything beside `courses/`), as data-dir-relative
/// paths `own_path_ok` accepts, with their metadata. The synced and hidden
/// folders, dot-names and symlinks (a subject's `AGENTS.md`) are not walked.
pub fn own_files(data_dir: &Path, code: &str) -> Vec<(String, std::fs::Metadata)> {
    let mut out = Vec::new();
    let mut pending = vec![(own_root(data_dir, code), own_root_rel(code))];
    while let Some((dir, rel)) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            let Ok(meta) = entry.metadata() else { continue };
            let child = child_rel(&rel, &name);
            if name.starts_with('.')
                || zone_of(&child) != Zone::Own
                || entry.file_type().is_ok_and(|t| t.is_symlink())
            {
                continue;
            }
            if meta.is_dir() {
                pending.push((entry.path(), child));
            } else if meta.is_file() && own_path_ok(&child) {
                out.push((child, meta));
            }
        }
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

/// The own entries on disk at the top of each subject and of the data dir
/// (`own_entries`). A sandbox that cannot carve the rest out of the folder
/// that holds them grants these one by one (`harness::providers`).
pub fn own_top_level(data_dir: &Path) -> Vec<PathBuf> {
    let codes = super::subjects_on_disk(data_dir);
    let mut out: Vec<PathBuf> = codes
        .iter()
        .map(String::as_str)
        .chain([TOP_LEVEL_CODE])
        .flat_map(|code| own_entries(data_dir, code))
        .collect();
    out.sort();
    out
}

/// The own entries directly in a subject's folder (for `TOP_LEVEL_CODE`, the
/// data dir's), files and folders: what sits beside `Course/` and `.oculus/`,
/// or beside `courses/` and the dot-names, less symlinks (a subject's
/// `AGENTS.md`). Sorted.
pub fn own_entries(data_dir: &Path, code: &str) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(own_root(data_dir, code)) else {
        return Vec::new();
    };
    let mut out: Vec<PathBuf> = entries
        .flatten()
        .filter(|entry| {
            let Ok(name) = entry.file_name().into_string() else {
                return false;
            };
            zone_of(&child_rel(&own_root_rel(code), &name)) == Zone::Own
                && !entry.file_type().is_ok_and(|t| t.is_symlink())
        })
        .map(|entry| entry.path())
        .collect();
    out.sort();
    out
}

/// The same folder, data-dir-relative.
pub fn own_dir_rel(code: &str, kind: OwnKind) -> String {
    match CURRENT.own_dir(kind) {
        "" => own_root_rel(code),
        dir => child_rel(&own_root_rel(code), dir),
    }
}

/// The folder beside a note that holds its pictures; also the prefix of the
/// links the note carries.
pub fn note_assets_dir() -> &'static str {
    CURRENT.note_assets
}

/// True for a data-dir-relative path the student may write, rename or
/// delete: in the own zone, below its folder, with no traversal, no
/// dot-name (staging files and hidden folders) and no `:` (a Windows drive
/// or stream).
pub fn own_path_ok(rel: &str) -> bool {
    CURRENT.own_path_ok(rel)
}

/// The kind of an own file, from its folder or its extension (the layout
/// decides which); `None` when `own_path_ok` refuses it.
pub fn own_kind_of(rel: &str) -> Option<OwnKind> {
    CURRENT.own_kind_of(rel)
}

/// True when `rel` is an own file of `kind`: `own_kind_of`, plus a name in
/// front of the kind's extension, and for a note, not one of the pictures
/// folder's files.
pub fn own_file_ok(rel: &str, kind: OwnKind) -> bool {
    CURRENT.own_file_ok(rel, kind)
}

impl Shape {
    /// The path inside its subject (at the top level, the whole path), when
    /// `rel` is in the own zone.
    fn own_inner<'a>(&self, rel: &'a str) -> Option<Vec<&'a str>> {
        if self.zone_of(rel) != Zone::Own {
            return None;
        }
        let mut parts = segments(rel)?;
        Some(if same_name(parts[0], COURSES_DIR) {
            parts.split_off(2)
        } else {
            parts
        })
    }

    pub fn own_path_ok(&self, rel: &str) -> bool {
        let Some(inner) = self.own_inner(rel) else {
            return false;
        };
        let base = usize::from(self.own_kind_by_folder);
        inner.len() > base
            && inner
                .iter()
                .all(|part| !part.starts_with('.') && !part.contains(':'))
    }

    pub fn own_kind_of(&self, rel: &str) -> Option<OwnKind> {
        if !self.own_path_ok(rel) {
            return None;
        }
        let inner = self.own_inner(rel)?;
        if self.own_kind_by_folder {
            self.own_dirs
                .iter()
                .find(|(_, dir)| !dir.is_empty() && same_name(inner[0], dir))
                .map(|(kind, _)| *kind)
        } else {
            Some(OwnKind::by_extension(inner.last()?))
        }
    }

    pub fn own_file_ok(&self, rel: &str, kind: OwnKind) -> bool {
        if self.own_kind_of(rel) != Some(kind) {
            return false;
        }
        let mut parts = rel.rsplit('/');
        let name = parts.next().unwrap_or_default();
        let folder = parts.next().unwrap_or_default();
        kind.extension()
            .is_none_or(|ext| name.len() > ext.len() && name.ends_with(ext))
            && !(kind == OwnKind::Document && same_name(folder, self.note_assets))
    }
}
