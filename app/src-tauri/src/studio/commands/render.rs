//! Rendering a video from the app: `studio_render` runs `render::render` off
//! the async runtime, then puts a Final or Small render into Drive
//! (`studio::export`), and reports each step as a `studio-render-progress`
//! event; `studio_render_cancel` stops it. One render per folder
//! (`render::RENDERS`), held until the export is done. Both take a video's
//! folder or its slug and refuse any other folder (`videos::scoped`). Rules:
//! docs/studio.md, "Rendering a video".

use std::path::Path;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::library::drive::ops::events;
use crate::studio::export::{self, Destination, DriveFile, Exported, Suggestion};
use crate::studio::render::{self, Finished, Preset, Progress, Report, RENDERS};
use crate::studio::videos;

/// Display only, never persisted.
pub const PROGRESS_EVENT: &str = "studio-render-progress";

/// The least time between two `rendering` events; a segment's first and
/// last frame are always sent.
const EVERY: Duration = Duration::from_millis(100);

#[derive(Serialize, Clone)]
struct Event<'a> {
    /// The folder as `studio_render` was given it.
    dir: &'a str,
    /// The preset's name.
    preset: &'a str,
    #[serde(flatten)]
    step: Step<'a>,
}

#[derive(Serialize, Clone)]
#[serde(tag = "phase", rename_all = "camelCase")]
enum Step<'a> {
    /// Sent when the render starts, then again with `plan` once it is made.
    Planning {
        #[serde(skip_serializing_if = "Option::is_none")]
        plan: Option<Plan>,
    },
    /// Segment `segment` of `of` (1-based), showing scene `scene`: `frame`
    /// of its `frames` encoded, at `fps` frames a second.
    Rendering {
        segment: usize,
        of: usize,
        scene: usize,
        frame: u64,
        frames: u64,
        fps: f64,
    },
    Muxing,
    /// Copying a Final or Small render into Drive.
    Exporting,
    Complete {
        path: &'a Path,
        report: &'a Report,
        /// Where a Final or Small render went in Drive.
        #[serde(skip_serializing_if = "Option::is_none")]
        drive: Option<&'a Exported>,
    },
    Cancelled,
    Error {
        error: &'a str,
    },
}

#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
struct Plan {
    segments: usize,
    cached: usize,
    /// Frames to render: the segments not cached.
    frames: u64,
    threads: usize,
}

/// A finished render, and where a Final or Small one went in Drive.
#[derive(Serialize)]
pub struct Rendered {
    #[serde(flatten)]
    report: Report,
    drive: Option<Exported>,
}

/// Render the video in `dir` (its folder or slug) to export `preset`
/// (`draft`, `final` or `small`), written to `<dir>/renders/<preset>.mp4`;
/// a Final or Small render then goes into Drive: to `destination` when given,
/// else over its linked file, else to the suggested folder. Resolves to the
/// report, or `null` when cancelled; rejects with the reason a render or its
/// export failed, when `dir` is not a video, or when it already has a render
/// running. A Draft's `destination` is ignored.
#[tauri::command]
pub async fn studio_render(
    app: AppHandle,
    dir: String,
    preset: String,
    destination: Option<Destination>,
) -> Result<Option<Rendered>, String> {
    let preset = Preset::parse(&preset)?;
    let folder = videos::scoped(Path::new(&dir))?;
    let running = super::videos::actions::start_render(&folder, preset)?;
    let name = preset.name();
    let emit = |step: Step<'_>| {
        app.emit(
            PROGRESS_EVENT,
            Event {
                dir: &dir,
                preset: name,
                step,
            },
        )
        .ok();
    };
    emit(Step::Planning { plan: None });
    let (app_for, folder_for, dir_for) = (app.clone(), folder.clone(), dir.clone());
    let (result, running) = crate::runtime::blocking::run(move || {
        let emit = |step: Step<'_>| {
            app_for
                .emit(
                    PROGRESS_EVENT,
                    Event {
                        dir: &dir_for,
                        preset: name,
                        step,
                    },
                )
                .ok();
        };
        let result = render_once(&app_for, &folder_for, preset, &running, &emit);
        Ok((result, running))
    })
    .await?;
    // A cancelled or failed render never reaches Drive.
    let result = match result {
        Ok(Some(report)) if export::exports(preset) => {
            emit(Step::Exporting);
            match to_drive(&folder, &report, destination).await {
                Ok(exported) => {
                    events::emit(&app, &exported.change);
                    Ok(Some(Rendered {
                        report,
                        drive: Some(exported),
                    }))
                }
                Err(e) => Err(format!(
                    "The {name} render is made but could not be saved to Drive: {e}"
                )),
            }
        }
        Ok(Some(report)) => Ok(Some(Rendered {
            report,
            drive: None,
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(e),
    };
    // Freed before the terminal event, so a listener can start the next
    // render as soon as it hears this one end.
    drop(running);
    match &result {
        Ok(Some(rendered)) => {
            let report = &rendered.report;
            let shown = rendered
                .drive
                .as_ref()
                .map_or(report.path.as_path(), |d| d.path.as_path());
            elog!(
                "[oculus] studio {name} render of {dir} wrote {} in {:.1} s",
                shown.display(),
                report.ms as f64 / 1000.0
            );
            emit(Step::Complete {
                path: &report.path,
                report,
                drive: rendered.drive.as_ref(),
            });
        }
        Ok(None) => {
            elog!("[oculus] studio {name} render of {dir} cancelled");
            emit(Step::Cancelled);
        }
        Err(error) => {
            elog!("[oculus] studio {name} render of {dir} failed: {error}");
            emit(Step::Error { error });
        }
    }
    result
}

async fn to_drive(
    folder: &Path,
    report: &Report,
    destination: Option<Destination>,
) -> Result<Exported, String> {
    let pool = crate::db::store::open_pool().await?;
    let data_dir = crate::library::paths::data_dir();
    let exported = export::to_drive(&data_dir, &pool, folder, report, destination).await;
    pool.close().await;
    exported
}

/// Where a first Final or Small render of the video `slug` would go: the
/// picker's start and the name it offers.
#[tauri::command]
pub async fn studio_export_suggestion(slug: String, preset: String) -> Result<Suggestion, String> {
    let preset = Preset::parse(&preset)?;
    let folder = videos::video_in(&videos::videos_dir(), &slug)?;
    let pool = crate::db::store::open_pool().await?;
    let suggestion = export::suggestion(&pool, &folder, preset).await;
    pool.close().await;
    suggestion
}

/// Ask the render of `dir` to stop; false when none runs.
#[tauri::command]
pub fn studio_render_cancel(dir: String) -> bool {
    videos::scoped(Path::new(&dir)).is_ok_and(|folder| RENDERS.cancel(&folder))
}

/// One preset's status, and the Drive file a Final or Small render went to.
#[derive(Serialize)]
pub struct ExportRow {
    #[serde(flatten)]
    status: render::ExportStatus,
    drive: Option<DriveFile>,
}

/// Every export preset of the video in `dir` (its folder or slug): its
/// file, if any, whether a render now would make the same file, and its
/// Drive file.
#[tauri::command]
pub async fn studio_exports(app: AppHandle, dir: String) -> Result<Vec<ExportRow>, String> {
    let folder = videos::scoped(Path::new(&dir))?;
    let ffmpeg = ffmpeg(&app)?;
    let at = folder.clone();
    let statuses = crate::runtime::blocking::run(move || {
        let library = crate::studio::libraries::libraries(false).map_err(|e| e.to_string())?;
        Ok(render::exports(&at, &ffmpeg, &library))
    })
    .await?;
    let slug = folder
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let pool = crate::db::store::open_pool().await?;
    let drive = export::drive_files(&crate::library::paths::data_dir(), &pool, &slug).await;
    pool.close().await;
    let drive = drive?;
    Ok(statuses
        .into_iter()
        .map(|status| {
            let file = drive
                .iter()
                .find_map(|(p, f)| (*p == status.preset).then(|| f.clone()));
            ExportRow {
                status,
                drive: file,
            }
        })
        .collect())
}

fn ffmpeg(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    crate::sources::echo360::find_ffmpeg(app.path().resource_dir().ok())
        .ok_or_else(|| "ffmpeg not found; run `bun run ffmpeg` in app/, or install it".to_owned())
}

/// Render `folder`, sending each step to `emit`.
fn render_once(
    app: &AppHandle,
    folder: &Path,
    preset: Preset,
    running: &render::Running,
    emit: &dyn Fn(Step<'_>),
) -> Result<Option<Report>, String> {
    let options = render::Options {
        preset,
        threads: None,
        out: None,
        ffmpeg: ffmpeg(app)?,
        library: crate::studio::libraries::libraries(false).map_err(|e| e.to_string())?,
    };
    let (mut of, mut scene) = (0, 0);
    let mut last: Option<Instant> = None;
    let finished = render::render(folder, &options, running.cancel_flag(), &mut |p| match p {
        Progress::Planned {
            segments,
            cached,
            frames,
            threads,
        } => {
            let plan = Plan {
                segments,
                cached,
                frames,
                threads,
            };
            emit(Step::Planning { plan: Some(plan) });
        }
        Progress::Segment {
            of: segments,
            scene: index,
            ..
        } => {
            (of, scene) = (segments, index);
            last = None;
        }
        Progress::Frame {
            n,
            frame,
            frames,
            fps,
        } => {
            if frame == frames || last.is_none_or(|t| t.elapsed() >= EVERY) {
                last = Some(Instant::now());
                let step = Step::Rendering {
                    segment: n,
                    of,
                    scene,
                    frame,
                    frames,
                    fps,
                };
                emit(step);
            }
        }
        Progress::Done(_) => {}
        Progress::Muxing => emit(Step::Muxing),
    })
    .map_err(|e| e.to_string())?;
    Ok(match finished {
        Finished::Complete(report) => Some(report),
        Finished::Cancelled => None,
    })
}
