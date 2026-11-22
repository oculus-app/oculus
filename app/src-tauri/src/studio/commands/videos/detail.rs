//! One video for its page: the row, its format and theme, whether it burns
//! captions in, each scene with its place in time and its words, and which
//! exports exist.

use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use studio_core::{ComponentSource, Library, Project};

use super::rows::VideoView;
use crate::db::store::StudioLink;
use crate::studio::render::Preset;
use crate::studio::videos;
use crate::studio::voice::{self, VoiceSettings};

/// Mirrors `VideoDetail` in `app/src/lib/studio/videos.ts`.
#[derive(Debug, Serialize, PartialEq)]
pub struct VideoDetail {
    pub row: VideoView,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub theme: String,
    pub voice: Option<String>,
    /// video.json's `captions`: the renders have captions burned in.
    pub captions: bool,
    /// Why a narrated video's scenes have no times (the script changed
    /// after narrating); null when they do, or nothing is narrated.
    #[serde(rename = "timingProblem")]
    pub timing_problem: Option<String>,
    /// When `script.md` and the narration manifest were last written, in
    /// seconds since the epoch: the chat's video card dates its steps by them.
    #[serde(rename = "scriptModified")]
    pub script_modified: Option<u64>,
    #[serde(rename = "narrationModified")]
    pub narration_modified: Option<u64>,
    pub scenes: Vec<SceneInfo>,
    pub renders: Vec<RenderFile>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct SceneInfo {
    pub id: Option<String>,
    pub component: String,
    /// The scene's `title` prop, when it has one.
    pub title: Option<String>,
    /// Its component resolves in the video's cascade; false while the agent
    /// has yet to write it.
    pub built: bool,
    /// Seconds; null while a scene's length is unknown (see `detail_in`).
    pub start: Option<f64>,
    pub duration: Option<f64>,
    pub text: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct RenderFile {
    pub preset: Preset,
    pub path: String,
    pub modified: u64,
    /// A video render's captions are beside it as `<preset>.vtt`.
    pub captions: bool,
}

/// The video `slug` under `videos`, with the voice it resolves to. Scene times are known once
/// every scene has a length: a hold, or narration that matches the script.
/// Until then they are null, and so is a stale narration's, which the page
/// meets as an error when it asks for a frame.
pub fn detail_in(
    videos: &Path,
    library: &Library,
    links: &HashMap<String, StudioLink>,
    settings: &VoiceSettings,
    slug: &str,
) -> Result<VideoDetail, String> {
    let dir = videos::video_in(videos, slug)?;
    let row = videos::row(&dir);
    let project = Project::load_with(&dir, library).map_err(|e| e.to_string())?;
    let timing = project.timeline();
    let timing_problem = if row.narrated {
        timing.as_ref().err().map(ToString::to_string)
    } else {
        None
    };
    let timeline = timing.ok();
    let components = project.components.names();
    let scenes = project
        .video
        .scenes
        .iter()
        .enumerate()
        .map(|(i, scene)| SceneInfo {
            id: scene.id.clone(),
            component: scene.component.clone(),
            title: scene
                .props
                .get("title")
                .and_then(|v| v.as_str())
                .map(str::to_owned),
            built: components.contains(&scene.component),
            start: timeline.as_ref().map(|t| t.start(i)),
            duration: timeline.as_ref().and_then(|t| t.scene_length(i)),
            text: project.section(i).map(|s| s.text.clone()),
        })
        .collect();
    let voice = voice::resolve_video(project.video.voice.as_ref(), settings)
        .ok()
        .map(|voice| voice.engine_and_id().1.to_owned());
    Ok(VideoDetail {
        row: VideoView::of(
            row,
            links,
            timeline.as_ref().and_then(|t| {
                let last = project.video.scenes.len().checked_sub(1)?;
                Some(t.start(last) + t.scene_length(last)?)
            }),
        ),
        fps: project.video.fps,
        width: project.video.size.width,
        height: project.video.size.height,
        theme: project.video.theme.clone(),
        voice,
        captions: project.video.captions,
        timing_problem,
        script_modified: modified(&dir.join("script.md")),
        narration_modified: modified(&dir.join("narration/manifest.json")),
        scenes,
        renders: renders(&dir),
    })
}

/// Each preset's file that exists, with when it was written.
fn renders(dir: &Path) -> Vec<RenderFile> {
    Preset::ALL
        .into_iter()
        .filter_map(|preset| {
            let path = preset.default_out(dir);
            let modified = path
                .metadata()
                .ok()?
                .modified()
                .ok()?
                .duration_since(UNIX_EPOCH)
                .ok()?
                .as_secs();
            let captions = path.with_extension("vtt").is_file();
            Some(RenderFile {
                preset,
                captions,
                path: path.to_string_lossy().into_owned(),
                modified,
            })
        })
        .collect()
}

fn modified(path: &Path) -> Option<u64> {
    path.metadata()
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
}
