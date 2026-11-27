//! Where a library path sits: in one subject's folder, or at the data dir's
//! top level, beside the folder that holds the subjects.

use std::path::{Path, PathBuf};

use super::roots::{course_rel, course_root, COURSES_DIR};
use super::shape::CURRENT;
use super::zone::{same_name, segments};

/// The `subjects.code` of the reserved row every top-level file's row hangs
/// off (`db::store::TOP_LEVEL_SUBJECT_ID`). A command that takes a subject
/// code takes this one for "no subject", and works at the top level.
pub const TOP_LEVEL_CODE: &str = "My Drive";

pub fn is_top_level_code(code: &str) -> bool {
    code == TOP_LEVEL_CODE
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Home<'a> {
    /// `courses/<folder>`, by the folder's name.
    Subject(&'a str),
    /// The data dir itself: the student's folders and files beside
    /// `courses/`.
    TopLevel,
}

/// The home of a data-dir-relative path; `""` is the top level itself.
/// `None` for a spelling that could leave the data dir, a dot-name at the
/// top or as the subject folder, and `courses` itself, which is no one's.
pub fn home_of(rel: &str) -> Option<Home<'_>> {
    if rel.is_empty() {
        return CURRENT.top_level_own.then_some(Home::TopLevel);
    }
    let parts = segments(rel)?;
    if parts[0].starts_with('.') {
        return None;
    }
    if same_name(parts[0], COURSES_DIR) {
        let folder = parts.get(1)?;
        return (!folder.starts_with('.')).then_some(Home::Subject(folder));
    }
    CURRENT.top_level_own.then_some(Home::TopLevel)
}

/// True for a home's own folder: `courses/<folder>`, or `""`.
pub fn is_home_root(rel: &str) -> bool {
    match home_of(rel) {
        Some(Home::Subject(_)) => rel.matches('/').count() == 1,
        Some(Home::TopLevel) => rel.is_empty(),
        None => false,
    }
}

/// `dir/name`, data-dir-relative; `dir` is `""` at the top level.
pub fn child_rel(dir: &str, name: &str) -> String {
    if dir.is_empty() {
        name.to_string()
    } else {
        format!("{dir}/{name}")
    }
}

/// A path's folder and its name; the folder is `""` for a top-level entry.
pub fn folder_and_name(rel: &str) -> (&str, &str) {
    rel.rsplit_once('/').unwrap_or(("", rel))
}

/// Where the student's files live for `code`, data-dir-relative: the
/// subject's folder, or `""` for `TOP_LEVEL_CODE`.
pub fn own_root_rel(code: &str) -> String {
    if is_top_level_code(code) {
        String::new()
    } else {
        course_rel(code)
    }
}

/// The same folder on disk.
pub fn own_root(data_dir: &Path, code: &str) -> PathBuf {
    if is_top_level_code(code) {
        data_dir.to_path_buf()
    } else {
        course_root(data_dir, code)
    }
}
