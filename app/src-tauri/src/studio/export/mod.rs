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
use crate::db::store::{delete_studio_exports, studio_exports_of};
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
    /// The export wrote the captions beside it, so a re-render may remove them.
    #[serde(skip)]
    pub captions: bool,
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
/// is there, it is the student's and it is on disk with the size and time
/// the export wrote; a link to anything else (another file put under its
/// name, say) counts as none, so the next render asks again.
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
            let written = link.written;
            let here = layout::zone_of(&rel) == Zone::Own
                && guard::own_entry(data_dir, &rel).is_ok_and(|e| !e.dir)
                && disk::stamp(&data_dir.join(&rel))
                    .is_ok_and(|stamp| stamp == (written.size, written.modified_ms));
            here.then_some((
                preset,
                DriveFile {
                    file_id: link.file_id,
                    rel,
                    captions: written.captions,
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
        return rows::replace(data_dir, pool, &slug, preset, &render, file).await;
    }
    let to = place::suggestion(pool, dir, preset).await?;
    place::make_folder(data_dir, &to.target_dir)?;
    let to = Destination {
        target_dir: to.target_dir,
        name: to.name,
    };
    rows::create(data_dir, pool, &slug, preset, &render, &to).await
}

/// Studio's bin on a Final or Small render: the Drive copy is deleted too,
/// as Drive deletes it (to the Trash, with Undo), while it is still this
/// export (`drive_file`: its row, and the size and time the export wrote),
/// with the captions the export wrote beside it. `None` when there is none.
pub async fn delete_drive_copy(
    data_dir: &Path,
    pool: &SqlitePool,
    slug: &str,
    preset: Preset,
    bin: std::sync::Arc<dyn crate::library::drive::ops::delete::Bin>,
) -> Result<Option<crate::library::drive::ops::delete::Sent>, String> {
    if !exports(preset) {
        return Ok(None);
    }
    let Some(file) = drive_file(data_dir, pool, slug, preset).await? else {
        return Ok(None);
    };
    let vtt = disk::captions_of(&file.rel);
    let mut rels = vec![file.rel];
    if file.captions && guard::own_entry(data_dir, &vtt).is_ok_and(|e| !e.dir) {
        rels.push(vtt);
    }
    crate::library::drive::ops::delete::send_at(data_dir, pool, &rels, bin)
        .await
        .map(Some)
        .map_err(|e| {
            format!(
                "Could not move the Drive copy to the {}: {}",
                crate::runtime::trash::BIN,
                e.message
            )
        })
}

/// Make the video `new` under `videos` (`videos::create_in`) with no Drive
/// links: a video of the same slug whose folder was deleted outside Studio
/// leaves its links, and this video's first render must never replace that
/// video's file. When the links can't be cleared the new folder goes again.
pub async fn create_video(
    pool: &SqlitePool,
    videos: &Path,
    new: &crate::studio::videos::NewVideo,
) -> Result<PathBuf, String> {
    let dir = crate::studio::videos::create_in(videos, new)?;
    if let Err(e) = delete_studio_exports(pool, &new.slug).await {
        let _ = std::fs::remove_dir_all(&dir);
        return Err(e);
    }
    Ok(dir)
}

/// The video's slug: its folder's name.
fn slug_of(dir: &Path) -> Result<String, String> {
    dir.file_name()
        .and_then(|n| n.to_str())
        .map(str::to_owned)
        .ok_or_else(|| format!("{} is not a video's folder", dir.display()))
}
