//! `to_drive`: a finished Final or Small render copied into Drive, called at
//! a render's success point and never otherwise, so a failed or cancelled
//! render leaves Drive alone. The first export lands in the folder the
//! student chose (or, from the CLI, the suggested one) under a free name, gets
//! its `files` row and is linked by that row's id (`studio_exports`); a later
//! one replaces the linked file wherever it is now, keeping its name. The
//! captions go beside it as `<name>.vtt`, the shape Transcribe writes, with a
//! row as reconcile would give one. `renders/` is still Studio's own copy.
//! Rules: docs/studio.md, "A Final or Small render goes to Drive".

mod disk;
mod place;
mod rows;
#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use super::render::{Preset, Report};
use crate::db::store::studio_exports_of;
use crate::library::drive::ops::events::DriveChange;
use crate::library::drive::ops::guard;
use crate::library::layout::{self, Zone};

pub use place::{make_folder, suggestion, Suggestion};

/// Where the student chose to put a first export: a Drive folder,
/// data-dir-relative (`""` is the top level), and the file's name.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Destination {
    pub target_dir: String,
    pub name: String,
}

/// A preset's Drive file as it is now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub file_id: i64,
    /// Data-dir-relative.
    pub rel: String,
}

/// What an export did.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exported {
    pub file: DriveFile,
    pub path: PathBuf,
    /// The captions beside it, data-dir-relative, when the video has them.
    pub captions: Option<String>,
    /// An existing Drive file was replaced rather than a new one made.
    pub replaced: bool,
    /// For `drive-changed`.
    #[serde(skip)]
    pub change: DriveChange,
}

/// Final and Small go to Drive; Draft never does.
pub fn exports(preset: Preset) -> bool {
    preset != Preset::Draft
}

/// The Drive file each preset of the video `slug` is linked to, when its row
/// is there, it is the student's and it is on disk; a link to anything else
/// counts as none, so the next render asks again.
pub async fn drive_files(
    data_dir: &Path,
    pool: &SqlitePool,
    slug: &str,
) -> Result<Vec<(Preset, DriveFile)>, String> {
    let links = studio_exports_of(pool, slug).await?;
    Ok(links
        .into_iter()
        .filter_map(|link| {
            let preset = Preset::parse(&link.preset).ok()?;
            let rel = link.relative_path;
            let here = layout::zone_of(&rel) == Zone::Own
                && guard::own_entry(data_dir, &rel).is_ok_and(|e| !e.dir);
            here.then_some((
                preset,
                DriveFile {
                    file_id: link.file_id,
                    rel,
                },
            ))
        })
        .collect())
}

/// One preset's `drive_files`.
pub async fn drive_file(
    data_dir: &Path,
    pool: &SqlitePool,
    slug: &str,
    preset: Preset,
) -> Result<Option<DriveFile>, String> {
    Ok(drive_files(data_dir, pool, slug)
        .await?
        .into_iter()
        .find_map(|(p, file)| (p == preset).then_some(file)))
}

/// Put the render `report` of the video in `dir` into Drive: at
/// `destination` when given (the link then moves to the new file), else over
/// the linked file, else in the suggested folder, making its `Videos` if
/// missing. Only Final and Small; the caller checks `exports`.
pub async fn to_drive(
    data_dir: &Path,
    pool: &SqlitePool,
    dir: &Path,
    report: &Report,
    destination: Option<Destination>,
) -> Result<Exported, String> {
    let slug = slug_of(dir)?;
    let preset = report.preset;
    let captions = report
        .sidecars
        .iter()
        .find(|p| p.extension().is_some_and(|e| e == "vtt"))
        .cloned();
    let render = disk::Render {
        mp4: report.path.clone(),
        captions,
    };
    if let Some(to) = destination {
        return rows::create(data_dir, pool, &slug, preset, &render, &to).await;
    }
    if let Some(file) = drive_file(data_dir, pool, &slug, preset).await? {
        return rows::replace(data_dir, pool, &render, file).await;
    }
    let to = place::suggestion(pool, dir, preset).await?;
    place::make_folder(data_dir, &to.target_dir)?;
    let to = Destination {
        target_dir: to.target_dir,
        name: to.name,
    };
    rows::create(data_dir, pool, &slug, preset, &render, &to).await
}

/// The video's slug: its folder's name.
fn slug_of(dir: &Path) -> Result<String, String> {
    dir.file_name()
        .and_then(|n| n.to_str())
        .map(str::to_owned)
        .ok_or_else(|| format!("{} is not a video's folder", dir.display()))
}
