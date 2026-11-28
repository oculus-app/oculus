//! Where a first export is suggested to go: `Videos` in the video's subject
//! (`courses/<subject>/Videos`), or `Videos` at Drive's top level for a video
//! with no subject Oculus knows, named after the video's title.

use std::path::Path;

use serde::Serialize;
use sqlx::SqlitePool;

use crate::library::drive::ops::{guard, names, rows};
use crate::library::layout::{self, Home};
use crate::library::paths::safe_dir;
use crate::studio::render::Preset;
use crate::studio::videos;

/// The folder a first export is suggested to go in.
pub const VIDEOS: &str = "Videos";

/// The suggested place: a data-dir-relative folder, which may not exist yet,
/// and a file name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub target_dir: String,
    pub name: String,
}

/// Where the video in `dir` would go for `preset`: `<title>.mp4`, or
/// `<title> (small).mp4` for Small, so both fit in one folder.
pub async fn suggestion(
    pool: &SqlitePool,
    dir: &Path,
    preset: Preset,
) -> Result<Suggestion, String> {
    let row = videos::row(dir);
    let mut home = String::new();
    if let Some(code) = &row.subject {
        let folder = safe_dir(code);
        let known = rows::home_id(pool, Home::Subject(&folder))
            .await
            .map_err(|e| e.message)?;
        if known.is_some() {
            home = layout::course_rel(code);
        }
    }
    Ok(Suggestion {
        target_dir: layout::child_rel(&home, VIDEOS),
        name: file_name(&row.title, preset),
    })
}

/// `<title>.mp4` as a name Drive keeps (`names::entry_name`).
pub fn file_name(title: &str, preset: Preset) -> String {
    let stem = match preset {
        Preset::Small => format!("{title} (small)"),
        _ => title.to_string(),
    };
    with_mp4(&names::entry_name(&format!("{stem}.mp4")))
}

/// `name`, ending in `.mp4` whatever the student typed.
pub fn with_mp4(name: &str) -> String {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".mp4") {
        name.to_string()
    } else {
        format!("{name}.mp4")
    }
}

/// Make the folder `rel` and any missing folder above it, each a name the
/// student could give in a folder new entries may land in; a subject's own
/// folder is made as creators make it. Only the CLI's unasked export makes
/// folders; the app's picker made its own.
pub fn make_folder(data_dir: &Path, rel: &str) -> Result<(), String> {
    if guard::drive_target(data_dir, rel).is_ok() {
        return Ok(());
    }
    if layout::is_home_root(rel) {
        std::fs::create_dir_all(data_dir.join(rel))
            .map_err(|e| format!("Could not make {rel}: {e}"))?;
        return guard::drive_target(data_dir, rel)
            .map(|_| ())
            .map_err(|e| e.message);
    }
    if rel.is_empty() {
        return Err("the library folder is missing".into());
    }
    let (parent, name) = layout::folder_and_name(rel);
    make_folder(data_dir, parent)?;
    let target = guard::drive_target(data_dir, parent).map_err(|e| e.message)?;
    names::check_name(name, &target.rel).map_err(|e| e.message)?;
    match std::fs::create_dir(target.path.join(name)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(e) => Err(format!("Could not make {rel}: {e}")),
    }
}
