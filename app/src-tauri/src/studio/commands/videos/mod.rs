//! The Studio page's commands: the videos under `<data>/studio/videos/`, one
//! video's detail, and PNG stills of it (docs/studio.md, "The Studio page's
//! commands"). The list also reads the series outlines beside `videos/`.

pub(super) mod actions;
mod delete;
mod detail;
mod frame;
pub mod narration;
mod rows;
pub(super) mod slot;
#[cfg(test)]
mod tests;
mod thumbnail;

use tauri::ipc::Response;

use crate::db::store::{
    delete_studio_exports, delete_studio_link, open_pool, setting, studio_links,
};
use crate::runtime::{blocking, trash::move_to_trash};
use crate::studio::libraries::libraries;
use crate::studio::videos::videos_dir;
use crate::studio::voice;
use detail::VideoDetail;
use frame::FrameAt;
use rows::VideoList;
use slot::on_render_slot;

/// The videos newest first; `subject` is a course code.
#[tauri::command]
pub async fn studio_videos(subject: Option<String>) -> Result<VideoList, String> {
    let links = studio_links(&open_pool().await?).await?;
    crate::runtime::blocking::run(move || rows::list_in(&videos_dir(), subject.as_deref(), &links))
        .await
}

#[tauri::command]
pub async fn studio_video_detail(slug: String) -> Result<VideoDetail, String> {
    let pool = open_pool().await?;
    let links = studio_links(&pool).await?;
    let row = setting(&pool, voice::SETTINGS_KEY).await?;
    let settings = voice::settings_from(row.as_deref());
    crate::runtime::blocking::run(move || {
        let library = libraries(false).map_err(|e| e.to_string())?;
        detail::detail_in(&videos_dir(), &library, &links, &settings, &slug)
    })
    .await
}

#[tauri::command]
pub async fn studio_set_theme(slug: String, theme: String) -> Result<(), String> {
    crate::runtime::blocking::run(move || {
        let dir = crate::studio::videos::video_in(&videos_dir(), &slug)?;
        let library = libraries(false).map_err(|e| e.to_string())?;
        actions::edit(&dir, || {
            crate::studio::videos::set_theme(&dir, &theme, &library)
        })
    })
    .await
}

#[tauri::command]
pub async fn studio_set_voice(slug: String, voice: Option<String>) -> Result<(), String> {
    crate::runtime::blocking::run(move || {
        let dir = crate::studio::videos::video_in(&videos_dir(), &slug)?;
        let settings = voice::settings();
        actions::edit(&dir, || {
            crate::studio::videos::set_voice(&dir, voice, &settings)
        })
    })
    .await
}

#[tauri::command]
pub async fn studio_video_delete(slug: String) -> Result<(), String> {
    let pool = open_pool().await?;
    // A new link for the same slug must wait until this one has been removed.
    let mut tx = pool
        .begin_with("BEGIN IMMEDIATE")
        .await
        .map_err(|e| format!("Could not begin deleting video `{slug}`: {e}"))?;
    let video = slug.clone();
    blocking::run(move || delete::video_in(&videos_dir(), &video, &move_to_trash)).await?;
    delete_studio_link(&mut *tx, &slug).await?;
    // Its Drive copies are the student's exports and stay; only the links go.
    delete_studio_exports(&mut *tx, &slug).await?;
    tx.commit().await.map_err(|e| {
        format!("Could not save the removal of the thread link for video `{slug}`: {e}")
    })
}

/// Moves the render in `renders/` to the Trash, then a Final or Small's
/// Drive copy as Drive deletes it, while it is still this export; returns
/// that delete, whose Undo the app's toast offers.
#[tauri::command]
pub async fn studio_render_delete(
    app: tauri::AppHandle,
    slug: String,
    preset: String,
) -> Result<Option<crate::library::drive::ops::delete::Sent>, String> {
    let (video, name) = (slug.clone(), preset.clone());
    blocking::run(move || delete::render_in(&videos_dir(), &video, &name, &move_to_trash)).await?;
    let preset = crate::studio::render::Preset::parse(&preset)?;
    let pool = open_pool().await?;
    let data_dir = crate::library::paths::data_dir();
    let bin = std::sync::Arc::new(crate::library::drive::ops::delete::SystemBin);
    let sent = crate::studio::export::delete_drive_copy(&data_dir, &pool, &slug, preset, bin).await;
    if let Ok(Some(sent)) = &sent {
        let change = crate::library::drive::ops::events::DriveChange {
            removed: sent.removed.clone(),
            ..Default::default()
        };
        crate::library::drive::ops::commands::announce(&app, &pool, change).await;
        crate::library::drive::ops::delete::commands::finish_unattended(sent);
    }
    pool.close().await;
    sent
}

/// Turns the video's burned-in captions on or off (video.json's
/// `captions`); the next render re-renders its narrated scenes.
#[tauri::command]
pub async fn studio_set_captions(slug: String, on: bool) -> Result<(), String> {
    crate::runtime::blocking::run(move || {
        let dir = crate::studio::videos::video_in(&videos_dir(), &slug)?;
        let _action = actions::lock();
        crate::studio::videos::set_captions(&dir, on)
    })
    .await
}

/// The WebVTT captions beside the video's `preset` render
/// (`renders/<preset>.vtt`), for the player's CC.
#[tauri::command]
pub async fn studio_render_captions(slug: String, preset: String) -> Result<String, String> {
    crate::runtime::blocking::run(move || {
        let preset = crate::studio::render::Preset::parse(&preset)?;
        let dir = crate::studio::videos::video_in(&videos_dir(), &slug)?;
        let path = preset.default_out(&dir).with_extension("vtt");
        std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))
    })
    .await
}

/// A PNG `width` pixels wide. Rejects with the reason when the narration is
/// stale.
#[tauri::command]
pub async fn studio_frame(slug: String, at: FrameAt, width: u32) -> Result<Response, String> {
    let bytes = on_render_slot(move || {
        let library = libraries(false).map_err(|e| e.to_string())?;
        frame::frame_png(&videos_dir(), &library, &slug, at, width)
    })
    .await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub async fn studio_thumbnail(slug: String) -> Result<Response, String> {
    let bytes = on_render_slot(move || {
        let library = libraries(false).map_err(|e| e.to_string())?;
        thumbnail::thumbnail_in(&videos_dir(), &library, &slug)
    })
    .await?;
    Ok(Response::new(bytes))
}
