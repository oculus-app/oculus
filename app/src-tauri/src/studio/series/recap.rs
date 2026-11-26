//! What a part's own chat needs before it makes the part: the outline and
//! the spoken script of the part before. It is the one sanctioned way for a
//! part to learn what an earlier part said; it never prints scene code.

use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use serde::Serialize;

use super::{show, PartStatus, SeriesStatus};
use crate::studio::videos;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Recap {
    #[serde(flatten)]
    pub series: SeriesStatus,
    pub part: PartStatus,
    /// `None` when `part` is the first.
    pub before: Option<Before>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Before {
    #[serde(flatten)]
    pub part: PartStatus,
    /// `script.md` in full; `None` while the part is not made, or its script is blank.
    pub script: Option<String>,
}

/// `part` is a 1-based part number, or else a part's slug.
pub fn recap(videos: &Path, series: &str, part: &str) -> Result<Recap, String> {
    let status = show(videos, series)?;
    let index = match part.parse::<usize>() {
        Ok(number) if (1..=status.parts.len()).contains(&number) => number - 1,
        Ok(number) => {
            return Err(format!(
                "series `{series}` has no part {number}: it has {} parts; run \
                 `oculus studio series show {series}` for them",
                status.parts.len()
            ))
        }
        Err(_) => status
            .parts
            .iter()
            .position(|p| p.part.slug == part)
            .ok_or_else(|| {
                format!(
                    "series `{series}` has no part `{part}`; run \
                     `oculus studio series show {series}` for its parts"
                )
            })?,
    };
    let this = status.parts[index].clone();
    let before = match index.checked_sub(1) {
        Some(i) => {
            let part = status.parts[i].clone();
            let script = if part.made {
                script(videos, &part.part.slug)?
            } else {
                None
            };
            Some(Before { part, script })
        }
        None => None,
    };
    Ok(Recap {
        series: status,
        part: this,
        before,
    })
}

// A missing or blank script has nothing to recap.
fn script(videos: &Path, slug: &str) -> Result<Option<String>, String> {
    let path = videos::video_in(videos, slug)?.join("script.md");
    match fs::read_to_string(&path) {
        Ok(text) if text.trim().is_empty() => Ok(None),
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

impl Recap {
    pub fn text(&self) -> String {
        let s = &self.series;
        let mut out = format!(
            "{}\nsubject {}, theme {}\n\n",
            s.header(),
            s.subject.as_deref().unwrap_or("none"),
            s.theme
        );
        for part in &s.parts {
            out += &part.line();
            out.push('\n');
        }
        out += &format!("\nThis part: {}\n\nThe part before: ", self.part.line());
        match &self.before {
            None => out += "none, this is the first part.\n",
            Some(Before { part, script }) => {
                let name = format!("{}. {} ({})", part.number, part.part.title, part.part.slug);
                match script {
                    None if part.made => out += &format!("{name}, made with an empty script.\n"),
                    None => out += &format!("{name}, not made yet.\n"),
                    Some(script) => {
                        out += &format!("{name}. Its script:\n\n{}\n", script.trim_end())
                    }
                }
            }
        }
        out
    }
}
