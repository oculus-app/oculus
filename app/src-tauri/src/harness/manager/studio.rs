//! The Studio section of a thread's brief: which video the conversation is
//! making, read off the video's folder on every send like the lecture's row.

use std::path::{Path, PathBuf};

use crate::db::store::StudioLink;
use crate::studio::series::{self, SeriesStatus};

/// What the brief says about the video a thread makes.
#[derive(Debug, Clone, PartialEq)]
pub struct StudioBrief {
    pub slug: String,
    pub series: Option<SeriesStatus>,
    /// The video's folder, absolute.
    pub dir: PathBuf,
    /// From video.json; `None` when it does not load, which the agent finds
    /// out by linting.
    pub theme: Option<String>,
    pub subject: Option<String>,
    /// 1080x1920: a reel rather than a landscape video.
    pub portrait: Option<bool>,
    /// Narration length asked for, in seconds.
    pub length_secs: Option<i64>,
}

impl StudioBrief {
    /// The brief for `link`'s video under `videos`; `None` once its folder
    /// is gone, so a deleted video is never briefed.
    pub fn read(videos: &Path, link: &StudioLink) -> Option<Self> {
        let dir = crate::studio::videos::video_in(videos, &link.slug).ok()?;
        let video = std::fs::read_to_string(dir.join("video.json"))
            .ok()
            .and_then(|text| serde_json::from_str::<studio_core::Video>(&text).ok());
        Some(Self {
            series: video
                .as_ref()
                .and_then(|v| v.series.as_deref())
                .and_then(|s| series::show(videos, s).ok()),
            slug: link.slug.clone(),
            theme: video.as_ref().map(|v| v.theme.clone()),
            subject: video.as_ref().and_then(|v| v.subject.clone()),
            portrait: video.as_ref().map(|v| v.size.height > v.size.width),
            length_secs: link.length_secs,
            dir,
        })
    }
}

/// What the agent is told about the video: its folder (so `oculus studio
/// new` is ruled out) and, for a series, the parts the student can request.
/// The draft is the hand-back; the final is the student's Export.
pub fn section(video: &StudioBrief) -> String {
    let StudioBrief {
        slug,
        series,
        dir,
        theme,
        subject,
        portrait,
        length_secs,
    } = video;
    let mut s = match series {
        Some(series) => format!(
            "\n## The video being made\n\nThis conversation is making the series **{}** (`{}`). \
             Its linked video is `{slug}` at `{}/`.\n\n",
            series.title, series.slug, dir.display()
        ),
        None => format!(
            "\n## The video being made\n\n\
             This conversation is making the Studio video **{slug}**. Its folder is \
             `{}/`; edit its `video.json`, `script.md`, `components/` and `assets/`; do not run \
             `oculus studio new`. Every `oculus studio` command takes `{slug}` where it says DIR.\n\n",
            dir.display()
        ),
    };
    match portrait {
        Some(true) => s.push_str("- Format: portrait, 1080x1920 (a reel).\n"),
        Some(false) => s.push_str("- Format: landscape, 1920x1080.\n"),
        None => {}
    }
    if let Some(theme) = theme {
        s.push_str(&format!(
            "- Theme: `{theme}` (video.json's `theme`); keep it unless the student asks.\n"
        ));
    }
    if let Some(code) = subject {
        s.push_str(&format!(
            "- Subject: `{code}`; its library, `../studio/subjects/{code}/`, is read \
             before the global one.\n"
        ));
    }
    if let Some(secs) = length_secs {
        s.push_str(&format!(
            "- Length: about {secs} seconds of narration, which is the target for the \
             script, not a limit to pad up to.\n"
        ));
    }
    if let Some(series) = series {
        s.push_str("\nParts in order:\n");
        for part in &series.parts {
            s.push_str(&format!("- {}\n", part.line()));
        }
        s.push_str(&format!(
            "Make only the requested part. For an entry with no folder, run \
             `oculus studio new <part-slug> --series {}`. Use that part's slug for its Studio \
             commands. Follow the `oculus-studio` skill and render its draft; never render \
             the final, which the student makes with Export.\n",
            series.slug
        ));
        return s;
    }
    s.push_str(&format!(
        "\nMake it with the `oculus-studio` skill; the folder is its step 2, done. \
         Render the draft with `oculus studio render {slug}` and say it is ready: the \
         app plays `renders/draft.mp4` inline in this conversation. The draft is the \
         hand-back; never render the final, which the student makes with Export.\n"
    ));
    s
}

/// Refresh a live session when the linked video or its outline and render status change.
pub(super) fn late_section(
    bound: Option<&StudioBrief>,
    brief: Option<&StudioBrief>,
) -> Option<String> {
    let brief = brief?;
    (bound != Some(brief)).then(|| section(brief).trim_start().to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::Scratch;

    fn link(slug: &str, length_secs: Option<i64>) -> StudioLink {
        StudioLink {
            slug: slug.into(),
            thread_id: Some(1),
            length_secs,
        }
    }

    #[test]
    fn the_brief_names_the_folder_and_reads_the_format_from_video_json() {
        let root = Scratch::new("studio-brief");
        let dir = root.join("bayes");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("video.json"),
            r#"{"size":{"width":1080,"height":1920},"theme":"warm","subject":"MAST20004",
                "scenes":[{"component":"TitleCard","hold":2}]}"#,
        )
        .unwrap();

        let brief = StudioBrief::read(&root, &link("bayes", Some(60))).unwrap();
        assert_eq!(brief.theme.as_deref(), Some("warm"));
        assert_eq!(brief.portrait, Some(true));
        let text = section(&brief);
        assert!(text.contains(&format!("`{}/`", dir.display())), "{text}");
        assert!(text.contains("portrait, 1080x1920"), "{text}");
        assert!(text.contains("Theme: `warm`"));
        assert!(text.contains("`../studio/subjects/MAST20004/`"));
        assert!(text.contains("about 60 seconds"));
        assert!(text.contains("oculus studio render bayes"));
        assert!(text.contains("never render the final"));
    }

    #[test]
    fn inserting_in_the_series_renumbers_list_show_and_the_live_brief() {
        use crate::studio::series::{Outline, Part};
        use crate::studio::videos::{create_in, list_in, NewVideo};
        use std::collections::BTreeMap;
        use std::fs;

        fn files(root: &Path) -> BTreeMap<PathBuf, (Vec<u8>, std::time::SystemTime)> {
            let mut found = BTreeMap::new();
            for entry in fs::read_dir(root).unwrap() {
                let path = entry.unwrap().path();
                if path.is_dir() {
                    found.extend(files(&path));
                } else if path.file_name().unwrap() != "series.json" {
                    found.insert(
                        path.clone(),
                        (
                            fs::read(&path).unwrap(),
                            fs::metadata(&path).unwrap().modified().unwrap(),
                        ),
                    );
                }
            }
            found
        }

        let root = Scratch::new("series-brief");
        let videos = root.join("videos");
        let part = |slug: &str, title: &str, question: &str| Part {
            slug: slug.into(),
            title: title.into(),
            question: question.into(),
        };
        series::create(
            &videos,
            "motion",
            &Outline {
                title: "Motion".into(),
                subject: None,
                theme: "default".into(),
                parts: vec![
                    part("motion", "Position", "Where is it?"),
                    part("speed", "Speed", "How fast?"),
                ],
            },
        )
        .unwrap();
        let linked = link("speed", None);
        let dir = create_in(
            &videos,
            &NewVideo::from_part(&videos, "motion", "speed").unwrap(),
        )
        .unwrap();
        let before_render = StudioBrief::read(&videos, &linked).unwrap();
        assert!(section(&before_render)
            .contains("2. Speed (speed) — How fast? [not made, folder exists]"));
        fs::create_dir(dir.join("renders")).unwrap();
        fs::write(dir.join("renders/draft.mp4"), b"render").unwrap();
        let before = StudioBrief::read(&videos, &linked).unwrap();
        assert!(late_section(Some(&before_render), Some(&before))
            .unwrap()
            .contains("How fast? [made]"));
        assert_eq!(list_in(&videos, None).unwrap()[0].part, Some(2));

        let untouched = files(&root);
        series::add(
            &videos,
            "motion",
            part("time", "Time", "How long?"),
            Some(2),
        )
        .unwrap();
        assert_eq!(files(&root), untouched);
        assert_eq!(list_in(&videos, None).unwrap()[0].part, Some(3));
        let shown = series::show(&videos, "motion").unwrap();
        assert_eq!(shown.parts[2].number, 3);
        assert_eq!(shown.parts[2].part.slug, "speed");
        let after = StudioBrief::read(&videos, &linked).unwrap();
        let text = late_section(Some(&before), Some(&after)).unwrap();
        assert!(text.contains("series **Motion** (`motion`)"));
        for line in [
            "1. Position (motion) — Where is it? [not made]",
            "2. Time (time) — How long? [not made]",
            "3. Speed (speed) — How fast? [made]",
        ] {
            assert!(text.contains(line), "{text}");
        }
        assert!(late_section(Some(&after), Some(&after)).is_none());
    }

    #[test]
    fn a_video_json_that_does_not_load_leaves_those_lines_out() {
        let root = Scratch::new("studio-brief-broken");
        std::fs::create_dir_all(root.join("broken")).unwrap();
        std::fs::write(root.join("broken/video.json"), "{").unwrap();
        let text = section(&StudioBrief::read(&root, &link("broken", None)).unwrap());
        assert!(text.contains("**broken**"));
        assert!(!text.contains("Format:") && !text.contains("Theme:"));
        assert!(!text.contains("Length:"));
        assert!(
            StudioBrief::read(&root, &link("deleted", None)).is_none(),
            "a link whose folder is gone briefs nothing"
        );
    }

    #[test]
    fn a_video_linked_after_spawn_rides_the_next_send_once() {
        let root = Scratch::new("studio-brief-late");
        std::fs::create_dir_all(root.join("bayes")).unwrap();
        let brief = StudioBrief::read(&root, &link("bayes", None)).unwrap();
        let late = late_section(None, Some(&brief)).unwrap();
        assert!(late.starts_with("## The video being made"), "{late}");
        assert_eq!(late_section(Some(&brief), Some(&brief)), None);
        let mut older = brief.clone();
        older.slug = "older".into();
        assert!(late_section(Some(&older), Some(&brief)).is_some());
        assert_eq!(late_section(None, None), None);
    }
}
