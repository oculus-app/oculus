//! Make an outline, insert a question or read the current part numbers.

use crate::*;
use app_lib::studio::{libraries, series, videos};

impl Ctx {
    pub(crate) fn studio_series(&self, action: StudioSeriesAction) -> Result<(), String> {
        let videos = videos::videos_dir();
        match action {
            StudioSeriesAction::New {
                slug,
                title,
                subject,
                theme,
            } => {
                let theme = match theme {
                    Some(theme) => theme,
                    None => libraries::default_theme(
                        &libraries::libraries(false).map_err(|e| e.to_string())?,
                        subject.as_deref(),
                    )?,
                };
                let outline = series::Outline {
                    title: title.trim().into(),
                    subject,
                    theme,
                    parts: Vec::new(),
                };
                series::create(&videos, &slug, &outline)?;
                if self.json {
                    return self.emit(&serde_json::json!({
                        "slug": slug,
                        "title": outline.title,
                        "subject": outline.subject,
                        "theme": outline.theme,
                        "parts": outline.parts,
                    }));
                }
                println!("made series {slug}");
            }
            StudioSeriesAction::Add {
                series,
                title,
                question,
                slug,
                at,
            } => {
                let slug = slug.unwrap_or_else(|| app_lib::agents::memory::slug(&title));
                let part = series::Part {
                    slug: slug.clone(),
                    title: title.trim().into(),
                    question: question.trim().into(),
                };
                let number = series::add(&videos, &series, part, at)?;
                if self.json {
                    return self
                        .emit(&serde_json::json!({"series":series, "number":number, "slug":slug}));
                }
                println!("{series} part {number}: {slug}");
            }
            StudioSeriesAction::Show { series } => {
                let outline = series::show(&videos, &series)?;
                if self.json {
                    return self.emit(&outline);
                }
                println!("{} ({series})", outline.title);
                for part in outline.parts {
                    println!("{}", part.line());
                }
            }
        }
        Ok(())
    }
}
