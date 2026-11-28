//! What a folder command may touch: an own entry, a target folder, and the
//! files below a folder. Every path is data-dir-relative and checked by the
//! layout's guard (`layout::own_path_ok`) before the disk is asked.

use std::path::{Path, PathBuf};

use super::error::{DriveError, DriveResult};
use crate::library::layout::{self, Home, Zone};
use crate::library::paths::{fold_code, safe_dir};

/// An existing file or folder of the student's.
#[derive(Clone, Debug)]
pub struct Entry {
    pub rel: String,
    pub path: PathBuf,
    pub dir: bool,
}

/// A folder new entries may land in: a subject's root, the top level (`""`)
/// or one of the student's folders in either.
#[derive(Clone, Debug)]
pub struct Target {
    pub rel: String,
    pub path: PathBuf,
}

impl Target {
    /// The subject this target is in, or the top level.
    pub fn home(&self) -> Home<'_> {
        layout::home_of(&self.rel).unwrap_or(Home::TopLevel)
    }

    pub fn child_rel(&self, name: &str) -> String {
        layout::child_rel(&self.rel, name)
    }

    /// True when `name` is one the layout keeps for itself in this folder:
    /// `Course` and `.oculus` at a subject's root, `courses` at the top level.
    pub fn keeps_name(&self, name: &str) -> bool {
        keeps_name(&self.rel, name)
    }
}

/// `Target::keeps_name` for the folder at `dir`.
pub fn keeps_name(dir: &str, name: &str) -> bool {
    if !layout::is_home_root(dir) {
        return false;
    }
    match layout::home_of(dir) {
        Some(Home::Subject(_)) => layout::reserved_name(name),
        Some(Home::TopLevel) => layout::reserved_top_name(name),
        None => false,
    }
}

pub fn parent_rel(rel: &str) -> &str {
    rel.rsplit_once('/').map_or("", |(parent, _)| parent)
}

/// The refusal for a path the student may not change: synced and hidden
/// paths are read-only, one that could leave the library is no name at all.
fn refusal(rel: &str) -> DriveError {
    match layout::zone_of(rel) {
        Zone::Outside => DriveError::invalid_name(format!("{rel} is not a library path")),
        _ => DriveError::read_only(rel),
    }
}

/// True when some folder on the way to `rel` (or `rel` itself) is a symlink:
/// Drive never follows one.
pub(super) fn through_symlink(data_dir: &Path, rel: &str) -> bool {
    let mut walked = data_dir.to_path_buf();
    rel.split('/').filter(|part| !part.is_empty()).any(|part| {
        walked.push(part);
        std::fs::symlink_metadata(&walked).is_ok_and(|m| m.file_type().is_symlink())
    })
}

/// `rel` as an existing entry the student may rename, move or delete.
pub fn own_entry(data_dir: &Path, rel: &str) -> DriveResult<Entry> {
    if layout::home_of(rel).is_none() || !layout::own_path_ok(rel) {
        return Err(refusal(rel));
    }
    existing(data_dir, rel)
}

/// `rel` as an existing entry a copy may read: anything Drive lists, synced
/// or own, but not app state, the folder of subjects or a subject's folder.
pub fn readable_entry(data_dir: &Path, rel: &str) -> DriveResult<Entry> {
    let inside = match layout::home_of(rel) {
        Some(Home::Subject(_)) => layout::split_course(rel).is_some(),
        Some(Home::TopLevel) => !rel.is_empty(),
        None => false,
    };
    let listed = inside
        && matches!(layout::zone_of(rel), Zone::Synced | Zone::Own)
        && !rel.split('/').any(|part| part.starts_with('.'));
    if !listed {
        return Err(refusal(rel));
    }
    existing(data_dir, rel)
}

fn existing(data_dir: &Path, rel: &str) -> DriveResult<Entry> {
    if through_symlink(data_dir, rel) {
        return Err(DriveError::read_only(rel));
    }
    let path = data_dir.join(rel);
    let meta = std::fs::symlink_metadata(&path).map_err(|_| DriveError::not_found(rel))?;
    Ok(Entry {
        rel: rel.to_string(),
        path,
        dir: meta.is_dir(),
    })
}

/// `rel` as a folder new entries may land in: a subject's root, the top
/// level (`""`), or an existing folder of the student's in either; its
/// subject, or none, is `Target::home`. A subject's folder must exist: it is
/// never made here. The folder of subjects itself is `read_only`.
pub fn drive_target(data_dir: &Path, rel: &str) -> DriveResult<Target> {
    if layout::home_of(rel).is_none() || (!layout::is_home_root(rel) && !layout::own_path_ok(rel)) {
        return Err(refusal(rel));
    }
    if through_symlink(data_dir, rel) {
        return Err(DriveError::read_only(rel));
    }
    let path = data_dir.join(rel);
    match std::fs::metadata(&path) {
        Ok(meta) if meta.is_dir() => Ok(Target {
            rel: rel.to_string(),
            path,
        }),
        Ok(_) => Err(DriveError::invalid_name(format!(
            "{} is not a folder",
            super::error::shown(rel)
        ))),
        Err(_) => Err(DriveError::not_found(rel)),
    }
}

/// Where a creator for subject `code` writes: `target_dir` when given (it
/// must be in that subject), else the subject's root, made if missing. For
/// `layout::TOP_LEVEL_CODE` the same at the top level.
pub fn own_target(data_dir: &Path, code: &str, target_dir: Option<&str>) -> DriveResult<Target> {
    let Some(rel) = target_dir else {
        let path = layout::own_root(data_dir, code);
        std::fs::create_dir_all(&path)?;
        return Ok(Target {
            rel: layout::own_root_rel(code),
            path,
        });
    };
    let target = drive_target(data_dir, rel)?;
    let same = match target.home() {
        Home::TopLevel => layout::is_top_level_code(code),
        Home::Subject(folder) => {
            !layout::is_top_level_code(code) && fold_code(folder) == fold_code(&safe_dir(code))
        }
    };
    if !same {
        return Err(DriveError::io(format!("{rel} is not in {code}")));
    }
    Ok(target)
}

/// Every file below `entry` (or the file itself), data-dir-relative, with no
/// symlink followed; dot-folders included, since they move and go with it.
pub fn files_under(entry: &Entry) -> Vec<String> {
    if !entry.dir {
        return vec![entry.rel.clone()];
    }
    let mut out = Vec::new();
    let mut pending = vec![(entry.path.clone(), entry.rel.clone())];
    while let Some((dir, rel)) = pending.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else {
            continue;
        };
        for child in read.flatten() {
            let Ok(name) = child.file_name().into_string() else {
                continue;
            };
            let Ok(kind) = child.file_type() else {
                continue;
            };
            let child_rel = format!("{rel}/{name}");
            if kind.is_dir() {
                pending.push((child.path(), child_rel));
            } else if kind.is_file() {
                out.push(child_rel);
            }
        }
    }
    out.sort();
    out
}
