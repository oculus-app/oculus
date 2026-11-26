//! The Videos list: each folder's `videos::VideoRow` with a title and the
//! thread that made it.

use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use studio_core::{Library, Project};

use serde::Serialize;

use crate::db::store::StudioLink;
use crate::studio::series::{self, PartStatus, SeriesStatus};
use crate::studio::videos::{self, VideoRow};

/// Mirrors `VideoRow` in `app/src/lib/studio/videos.ts`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VideoView {
    pub slug: String,
    pub dir: String,
    pub title: String,
    pub subject: Option<String>,
    pub series: Option<String>,
    pub part: Option<usize>,
    pub scenes: Option<usize>,
    pub narrated: bool,
    pub renders: Vec<String>,
    pub modified: Option<u64>,
    pub problem: Option<String>,
    pub thread_id: Option<i64>,
    pub seconds: Option<f64>,
}

impl VideoView {
    /// `links` is the whole link table, by slug.
    pub fn of(row: VideoRow, links: &HashMap<String, StudioLink>, seconds: Option<f64>) -> Self {
        Self {
            seconds,
            title: row.title,
            thread_id: links.get(&row.slug).and_then(|l| l.thread_id),
            dir: row.dir.to_string_lossy().into_owned(),
            slug: row.slug,
            subject: row.subject,
            series: row.series,
            part: row.part,
            scenes: row.scenes,
            narrated: row.narrated,
            renders: row.renders,
            modified: row.modified,
            problem: row.problem,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct VideoList {
    pub videos: Vec<VideoView>,
    pub series: Vec<SeriesView>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesView {
    #[serde(flatten)]
    pub outline: SeriesStatus<PartView>,
    pub modified: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct PartView {
    #[serde(flatten)]
    pub status: PartStatus,
    pub video: Option<VideoView>,
}

/// The videos under `videos`, newest change first (a video whose video.json
/// does not load sorts last), optionally one subject's.
pub fn list_in(
    videos: &Path,
    subject: Option<&str>,
    links: &HashMap<String, StudioLink>,
) -> Result<VideoList, String> {
    let mut folders = videos::folder_rows(videos, None)?;
    let root = videos.parent().unwrap_or(videos);
    let library = Library {
        global: Some(root.join("library")),
        subjects: Some(root.join("subjects")),
        ..Default::default()
    };
    let seconds: HashMap<_, _> = folders
        .iter()
        .map(|row| {
            let duration = Project::read_timeline_with(&row.dir, &library)
                .ok()
                .and_then(|t| {
                    let last = row.scenes?.checked_sub(1)?;
                    Some(t.start(last) + t.scene_length(last)?)
                });
            (row.slug.clone(), duration)
        })
        .collect();
    let mut by_slug: HashMap<_, _> = folders.iter_mut().map(|r| (r.slug.clone(), r)).collect();
    let mut series = Vec::new();
    for (slug, outline) in series::list(videos)? {
        let matches_subject = subject.is_none() || outline.subject.as_deref() == subject;
        let view = outline.status(&slug, |number, part| {
            let row = by_slug
                .get_mut(&part.slug)
                .filter(|r| r.series.as_deref() == Some(&slug));
            let row = row.map(|r| {
                r.part = Some(number);
                &**r
            });
            let status = PartStatus::new(number, part, row);
            let video = row.map(|r| VideoView::of(r.clone(), links, seconds[&r.slug]));
            PartView { status, video }
        });
        if matches_subject {
            let modified = crate::library::paths::studio_series_dir(videos)
                .join(&slug)
                .join("series.json")
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .into_iter()
                .chain(view.parts.iter().filter_map(|p| p.video.as_ref()?.modified))
                .max();
            series.push(SeriesView {
                outline: view,
                modified,
            });
        }
    }
    let mut rows: Vec<_> = folders
        .into_iter()
        .filter(|r| subject.is_none() || r.subject.as_deref() == subject)
        .map(|row| {
            let duration = seconds[&row.slug];
            VideoView::of(row, links, duration)
        })
        .collect();
    rows.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then_with(|| a.slug.cmp(&b.slug))
    });
    Ok(VideoList {
        videos: rows,
        series,
    })
}
