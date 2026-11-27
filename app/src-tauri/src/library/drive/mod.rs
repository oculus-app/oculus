//! Drive: one folder of the library at a time, as the folder browser shows it.
//! The top level is the data dir itself: `courses/` (shown as Subjects),
//! then the student's own folders and files; a dot-name is the app's.
//!
//! `list_folder` reads the disk, so empty folders show and a file with no
//! `files` row still lists; the frontend joins rows (parse and embed state,
//! recency) onto the entries by `relative_path`. Only the lecture recordings
//! come from the database, because a recording opens the lecture page, not a
//! folder. What the listing leaves out: dot-names, symlinks, hidden app state
//! (`layout::zone_of`), and a file's parse artifacts and converted PDF
//! (`paths::parse_artifacts`), which its row already toggles to.
//! The student's folder commands (create, rename, move, copy, delete) and
//! the target folders every own-file creator takes are `ops`.
//! docs/frontend.md has the browser this feeds.

pub mod commands;
mod entries;
pub(crate) mod listing;
pub mod ops;
mod recordings;

#[cfg(test)]
mod tests;
