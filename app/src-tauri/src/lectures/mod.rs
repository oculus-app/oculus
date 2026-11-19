//! Tauri commands over the Echo360 core in `sources/echo360/` (shared with the CLI):
//! the app's session cache, paths and events.

pub mod chapters;
pub mod commands;
mod downloads;
pub mod lecture_end;
pub(crate) mod lecture_jobs;
pub mod media;

pub use downloads::DownloadCancels;

use crate::sources::echo360::cache::get_or_auth;
pub use crate::sources::echo360::cache::Echo360Cache;
pub use crate::sources::echo360::Lecture as LectureData;
