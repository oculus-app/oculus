//! `oculus studio new`, `list` and `title`: the videos under
//! `<app data>/studio/videos/` (`app_lib::studio::videos`).

use crate::*;
use app_lib::library::paths::iso8601_utc;
use app_lib::studio::libraries::{default_theme, libraries};
use app_lib::studio::videos::{self, NewVideo, VideoRow};

impl Ctx {
    pub(crate) fn studio_new(&self, args: &StudioNewArgs) -> Result<(), String> {
        let library = libraries(false).map_err(|e| e.to_string())?;
        let videos = videos::videos_dir();
        let mut new = match &args.series {
            Some(series) => NewVideo::from_part(&videos, series, &args.slug)?,
            None => NewVideo {
                slug: args.slug.clone(),
                subject: args.subject.clone(),
                theme: Some(match &args.theme {
                    Some(theme) => theme.clone(),
                    None => default_theme(&library, args.subject.as_deref())?,
                }),
                ..NewVideo::default()
            },
        };
        if let Some(title) = &args.title {
            new.title = Some(title.clone());
        }
        new.portrait = args.portrait;
        // A video is narrated, so it needs a voice before any work goes into
        // it; a scratch video is only drawn.
        if !args.scratch {
            let voice = app_lib::studio::voice::VoiceOverrides::default();
            app_lib::studio::voice::resolve(&voice, &voice, &app_lib::studio::voice::settings())?;
        }
        let dir = videos::create_in(&videos, &new)?;
        if let Err(e) = studio_core::Project::load_with(&dir, &library) {
            std::fs::remove_dir_all(&dir).ok();
            return Err(e.to_string());
        }
        if self.json {
            return self.emit(&serde_json::json!({
                "dir": dir.to_string_lossy(),
                "slug": args.slug,
            }));
        }
        println!("{} {}", paint("made", GREEN), dir.display());
        Ok(())
    }

    pub(crate) fn studio_list(&self, args: &StudioListArgs) -> Result<(), String> {
        let rows = videos::list_in(&videos::videos_dir(), args.subject.as_deref())?;
        if self.json {
            let rows: Vec<serde_json::Value> = rows.iter().map(row_json).collect();
            return self.emit(&rows);
        }
        if rows.is_empty() {
            println!(
                "{}",
                paint(
                    &format!(
                        "no videos in {}; `oculus studio new <slug>` makes one",
                        videos::videos_dir().display()
                    ),
                    DIM
                )
            );
        }
        for row in &rows {
            print_row(row);
        }
        Ok(())
    }

    pub(crate) fn studio_title(&self, args: &StudioTitleArgs) -> Result<(), String> {
        videos::set_title(&args.dir, &args.title)?;
        let title = args.title.trim();
        if self.json {
            return self.emit(&serde_json::json!({
                "dir": args.dir.to_string_lossy(),
                "title": title,
            }));
        }
        println!("{} {}", paint("renamed", GREEN), title);
        Ok(())
    }
}

fn row_json(row: &VideoRow) -> serde_json::Value {
    serde_json::json!({
        "slug": row.slug,
        "title": row.title,
        "dir": row.dir.to_string_lossy(),
        "subject": row.subject,
        "series": row.series,
        "part": row.part,
        "scenes": row.scenes,
        "narrated": row.narrated,
        "renders": row.renders,
        "modified": row.modified.map(iso8601_utc),
        "problem": row.problem,
    })
}

/// `slug  SUBJECT  3 scenes  narrated  draft.mp4  2026-10-12T03:14:00  Title`,
/// or the slug and why its video.json does not load.
fn print_row(row: &VideoRow) {
    if let Some(problem) = &row.problem {
        println!(
            "{} {}",
            paint(&format!("{:<28}", row.slug), BOLD),
            paint(problem, YELLOW)
        );
        return;
    }
    let series = match (&row.series, row.part) {
        (Some(s), Some(n)) => format!("  {s} part {n}"),
        (Some(s), None) => format!("  {s} (missing outline entry)"),
        _ => String::new(),
    };
    let scenes = row.scenes.unwrap_or(0);
    let renders = if row.renders.is_empty() {
        "no renders".to_owned()
    } else {
        row.renders.join(", ")
    };
    println!(
        "{} {:<12} {:>2} scene{} {:<10} {:<22} {}  {}{series}",
        paint(&format!("{:<28}", row.slug), BOLD),
        row.subject.as_deref().unwrap_or("-"),
        scenes,
        if scenes == 1 { " " } else { "s" },
        if row.narrated {
            "narrated"
        } else {
            "unnarrated"
        },
        renders,
        paint(&row.modified.map(iso8601_utc).unwrap_or_default(), DIM),
        row.title,
    );
}
