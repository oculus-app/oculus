//! Narration from the video page, with progress keyed by the video row's folder.

use std::{path::Path, sync::atomic::AtomicBool, time::Instant};

use serde::Serialize;
use studio_core::Project;
use tauri::{AppHandle, Emitter};

use super::actions;
use crate::runtime::blocking;
use crate::studio::libraries::libraries;
use crate::studio::narrate::running::NARRATIONS;
use crate::studio::narrate::{self, ModelAligner, NarrationStatus, Outcome, Progress};
use crate::studio::videos::{video_in, videos_dir};
use crate::studio::voice;

pub const PROGRESS_EVENT: &str = "studio-narrate-progress";

#[derive(Clone, Serialize)]
pub(super) struct Event<'a> {
    pub dir: &'a str,
    #[serde(flatten)]
    pub step: Step<'a>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub(super) enum Step<'a> {
    Scene {
        id: &'a str,
        n: usize,
        of: usize,
    },
    Done {
        id: &'a str,
        n: usize,
        of: usize,
        outcome: Outcome,
    },
    Complete {
        scenes: u32,
        narrated: u32,
    },
    Cancelled,
    Error {
        error: &'a str,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrateSummary {
    pub scenes: u32,
    pub narrated: u32,
    pub ms: u64,
}

#[tauri::command]
pub async fn studio_narration_status(slug: String) -> Result<NarrationStatus, String> {
    blocking::run(move || {
        let dir = video_in(&videos_dir(), &slug)?;
        let library = libraries(false).map_err(|e| e.to_string())?;
        let project = Project::load_unnarrated_with(&dir, &library).map_err(|e| e.to_string())?;
        Ok(narrate::status(&project, &voice::settings()))
    })
    .await
}

#[tauri::command]
pub async fn studio_narrate(
    app: AppHandle,
    slug: String,
) -> Result<Option<NarrateSummary>, String> {
    blocking::run(move || {
        let dir = video_in(&videos_dir(), &slug)?;
        let running = actions::start_narration(&dir)?;
        let display_dir = dir.to_string_lossy();
        let emit = |step: Step<'_>| {
            app.emit(
                PROGRESS_EVENT,
                Event {
                    dir: &display_dir,
                    step,
                },
            )
            .ok();
        };
        let result = narrate_video(&dir, running.cancel_flag(), &emit);
        drop(running);
        match &result {
            Ok(Some(summary)) => {
                elog!(
                    "[oculus] studio narration of {display_dir} completed in {} ms",
                    summary.ms
                );
                emit(Step::Complete {
                    scenes: summary.scenes,
                    narrated: summary.narrated,
                });
            }
            Ok(None) => {
                elog!("[oculus] studio narration of {display_dir} cancelled");
                emit(Step::Cancelled);
            }
            Err(error) => {
                elog!("[oculus] studio narration of {display_dir} failed: {error}");
                emit(Step::Error { error });
            }
        }
        result
    })
    .await
}

fn narrate_video(
    dir: &Path,
    cancel: &AtomicBool,
    emit: &dyn Fn(Step<'_>),
) -> Result<Option<NarrateSummary>, String> {
    let started = Instant::now();
    let library = libraries(false).map_err(|e| e.to_string())?;
    let project = Project::load_unnarrated_with(dir, &library).map_err(|e| e.to_string())?;
    let voice = voice::resolve_video(project.video.voice.as_ref(), &voice::settings())?;
    let speakers = narrate::speaker(&voice, project.video.subject.as_deref());
    let report = narrate::narrate_project(
        &project,
        speakers.speaker(),
        &ModelAligner,
        &narrate::Options::default(),
        Some(cancel),
        &mut |progress| match progress {
            Progress::Reset(why) => elog!(
                "[oculus] studio narration of {} is rebuilding its manifest: {why}",
                dir.display()
            ),
            Progress::Start { id, n, of } => emit(Step::Scene { id, n, of }),
            Progress::Done { scene, n, of } => emit(Step::Done {
                id: &scene.id,
                n,
                of,
                outcome: scene.outcome,
            }),
        },
    )
    .map_err(|e| e.to_string())?;
    Ok(report.map(|report| NarrateSummary {
        scenes: report.scenes.len() as u32,
        narrated: report
            .scenes
            .iter()
            .filter(|scene| scene.outcome == Outcome::Narrated)
            .count() as u32,
        ms: started.elapsed().as_millis() as u64,
    }))
}

#[tauri::command]
pub fn studio_narrate_cancel(slug: String) -> bool {
    video_in(&videos_dir(), &slug).is_ok_and(|dir| NARRATIONS.cancel(&dir))
}
