//! Read the current outline alongside the matching video folders.

use std::fs;
use std::path::Path;

use serde::Serialize;

use super::{read, Outline, Part};
use crate::studio::videos::{self, valid_slug, VideoRow};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SeriesStatus<P = PartStatus> {
    pub slug: String,
    pub title: String,
    pub subject: Option<String>,
    pub theme: String,
    pub parts: Vec<P>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PartStatus {
    #[serde(flatten)]
    pub part: Part,
    pub number: usize,
    pub exists: bool,
    pub made: bool,
}

impl<P> SeriesStatus<P> {
    /// `Title (slug)`, the first line `series show` and `series recap` print.
    pub fn header(&self) -> String {
        format!("{} ({})", self.title, self.slug)
    }
}

impl PartStatus {
    pub fn new(number: usize, part: Part, video: Option<&VideoRow>) -> Self {
        Self {
            part,
            number,
            exists: video.is_some(),
            made: video.is_some_and(VideoRow::has_render),
        }
    }

    pub fn line(&self) -> String {
        let status = match (self.made, self.exists) {
            (true, _) => "made",
            (false, true) => "not made, folder exists",
            (false, false) => "not made",
        };
        format!(
            "{}. {} ({}) — {} [{}]",
            self.number, self.part.title, self.part.slug, self.part.question, status
        )
    }
}

impl Outline {
    pub fn status<P>(self, slug: &str, mut part: impl FnMut(usize, Part) -> P) -> SeriesStatus<P> {
        SeriesStatus {
            slug: slug.to_owned(),
            title: self.title,
            subject: self.subject,
            theme: self.theme,
            parts: self
                .parts
                .into_iter()
                .enumerate()
                .map(|(i, p)| part(i + 1, p))
                .collect(),
        }
    }
}

pub fn show(videos: &Path, series: &str) -> Result<SeriesStatus, String> {
    let outline = read(videos, series)?;
    Ok(outline.status(series, |number, part| {
        let row = videos::video_in(videos, &part.slug)
            .ok()
            .map(|dir| videos::folder_row(&dir))
            .filter(|r| r.series.as_deref() == Some(series));
        PartStatus::new(number, part, row.as_ref())
    }))
}

pub fn list(videos: &Path) -> Result<Vec<(String, Outline)>, String> {
    let root = crate::library::paths::studio_series_dir(videos);
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("{}: {e}", root.display())),
    };
    let mut series = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let slug = entry.file_name();
        let Some(slug) = slug.to_str().filter(|s| valid_slug(s)) else {
            continue;
        };
        if !entry.path().join("series.json").is_file() {
            continue;
        }
        match read(videos, slug) {
            Ok(outline) => series.push((slug.to_owned(), outline)),
            // An unfinished hand edit must not hide the rest of the Videos grid.
            Err(error) => elog!("[studio] {error}"),
        }
    }
    series.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(series)
}
