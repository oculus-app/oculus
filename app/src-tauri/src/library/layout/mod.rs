//! Every path shape in the library, in one place.
//!
//! The library is the data dir: `courses/<code>/…` holds the subjects, and
//! the student owns everything else at the top whose name does not start
//! with a dot (`Home`). Inside a subject, Oculus's sync writes
//! `Course/` (the synced kinds, `SyncedKind`, with `home.md`, `syllabus.md`
//! and the lecture recordings), the student owns everything beside it at any
//! depth (`OwnKind`, by extension), and app state sits in `.oculus/`.
//! `zone_of` is the one question a guard asks of a data-dir-relative path;
//! `category_of` labels a row; `derived` names a PDF's parse artifacts.
//! Folder names are data in `shape::CURRENT`, so a new layout changes that
//! table, not its callers; `LEGACY` is the layout before this one.
//! docs/architecture.md has the tree.

mod category;
mod derived;
mod hidden;
mod home;
mod moves;
mod own;
mod recordings;
mod roots;
mod shape;
mod synced;
mod zone;

#[cfg(test)]
mod tests;

pub use category::*;
pub use derived::*;
pub use hidden::*;
pub use home::*;
pub use moves::*;
pub use own::*;
pub use recordings::*;
pub use roots::*;
pub use shape::{Recordings, Shape, LEGACY};
pub use synced::*;
pub use zone::*;
