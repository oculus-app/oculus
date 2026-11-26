//! A series owns the order and questions of its videos in a single outline.

mod recap;
mod view;
pub use recap::{recap, Before, Recap};
pub use view::{list, show, PartStatus, SeriesStatus};

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use studio_core::{valid_subject, valid_theme_name};

use super::videos::valid_slug;
use crate::library::paths::studio_series_dir;
use crate::runtime::atomic_write;

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Outline {
    pub title: String,
    pub subject: Option<String>,
    pub theme: String,
    pub parts: Vec<Part>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Part {
    pub slug: String,
    pub title: String,
    pub question: String,
}

fn path(videos: &Path, slug: &str) -> Result<PathBuf, String> {
    if !valid_slug(slug) {
        return Err(format!("invalid series slug `{slug}`: use lowercase letters, digits and `-`, at most 64 characters"));
    }
    Ok(studio_series_dir(videos).join(slug).join("series.json"))
}

impl Outline {
    fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty() {
            return Err("a series needs a title".into());
        }
        if self.subject.as_deref().is_some_and(|s| !valid_subject(s)) {
            return Err("invalid series subject: use a course code".into());
        }
        if !valid_theme_name(&self.theme) {
            return Err(format!("invalid series theme name `{}`", self.theme));
        }
        let mut slugs = HashSet::new();
        for part in &self.parts {
            if !valid_slug(&part.slug) {
                return Err(format!(
                    "invalid part slug `{}`: give a valid --slug",
                    part.slug
                ));
            }
            if part.title.trim().is_empty() || part.question.trim().is_empty() {
                return Err("a part needs a title and a question".into());
            }
            if !slugs.insert(&part.slug) {
                return Err(format!("part `{}` appears twice in the outline", part.slug));
            }
        }
        Ok(())
    }

    pub fn entry(&self, series: &str, slug: &str) -> Result<(usize, &Part), String> {
        self.parts
            .iter()
            .enumerate()
            .find(|(_, p)| p.slug == slug)
            .map(|(i, p)| (i + 1, p))
            .ok_or_else(|| {
                format!(
                    "video `{slug}` is not in series `{series}`; run \
                 `oculus studio series add {series} --slug {slug} --title … --question …` first"
                )
            })
    }
}

pub fn read(videos: &Path, slug: &str) -> Result<Outline, String> {
    let path = path(videos, slug)?;
    let text = match fs::read(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(format!(
                "there is no series `{slug}` ({} is missing)",
                path.display()
            ))
        }
        Err(e) => return Err(format!("{}: {e}", path.display())),
    };
    let load = || -> Result<Outline, String> {
        let outline: Outline = serde_json::from_slice(&text).map_err(|e| e.to_string())?;
        outline.validate()?;
        Ok(outline)
    };
    load().map_err(|e| format!("{}: {e}", path.display()))
}

// Writers lock a stable sibling because atomic replacement changes the manifest's inode.
fn writer(path: &Path) -> Result<fs::File, String> {
    let lock = path.with_file_name(".outline.lock");
    let file = fs::File::options()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(&lock)
        .map_err(|e| format!("{}: {e}", lock.display()))?;
    file.lock()
        .map_err(|e| format!("{}: {e}", lock.display()))?;
    Ok(file)
}

pub fn create(videos: &Path, slug: &str, outline: &Outline) -> Result<(), String> {
    outline.validate()?;
    let path = path(videos, slug)?;
    let dir = path.parent().unwrap();
    fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let _lock = writer(&path)?;
    if path.try_exists().map_err(|e| e.to_string())? {
        return Err(format!("series `{slug}` already exists"));
    }
    atomic_write::json(&path, outline)
}

pub fn add(videos: &Path, series: &str, part: Part, at: Option<usize>) -> Result<usize, String> {
    let path = path(videos, series)?;
    let _lock = writer(&path)?;
    let mut outline = read(videos, series)?;
    let end = outline.parts.len() + 1;
    let number = at.unwrap_or(end);
    if !(1..=end).contains(&number) {
        return Err(format!("--at must be between 1 and {end}"));
    }
    outline.parts.insert(number - 1, part);
    outline.validate()?;
    atomic_write::json(&path, &outline)?;
    Ok(number)
}

pub fn part_number(videos: &Path, series: &str, slug: &str) -> Result<usize, String> {
    read(videos, series)?
        .entry(series, slug)
        .map(|(number, _)| number)
}

/// A project-level error for the CLI's whole-video and single-scene lint reports.
pub fn lint(project: &studio_core::Project, videos: &Path) -> Option<studio_core::LintIssue> {
    let series = project.video.series.as_deref()?;
    let result = project
        .dir
        .canonicalize()
        .map_err(|e| e.to_string())
        .and_then(|dir| {
            let slug = dir.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            part_number(videos, series, slug)
        });
    Some(studio_core::LintIssue {
        level: studio_core::LintLevel::Error,
        scene: None,
        id: None,
        component: None,
        example: None,
        group: None,
        error: studio_core::StudioError::Project {
            path: project.dir.join("video.json"),
            message: result.err()?,
        },
    })
}

#[cfg(test)]
mod tests;
