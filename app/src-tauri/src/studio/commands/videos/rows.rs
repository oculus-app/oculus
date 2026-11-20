//! The Videos list: each folder's `videos::VideoRow` with a title and the
//! thread that made it.

use std::collections::HashMap;
use std::path::Path;

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
}

impl VideoView {
    /// `links` is the whole link table, by slug.
    pub fn of(row: VideoRow, links: &HashMap<String, StudioLink>) -> Self {
        Self {
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
    pub series: Vec<SeriesStatus<PartView>>,
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
            let video = row
                .filter(|_| status.made)
                .map(|r| VideoView::of(r.clone(), links));
            PartView { status, video }
        });
        if matches_subject {
            series.push(view);
        }
    }
    let mut rows: Vec<_> = folders
        .into_iter()
        .filter(|r| subject.is_none() || r.subject.as_deref() == subject)
        .map(|row| VideoView::of(row, links))
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
