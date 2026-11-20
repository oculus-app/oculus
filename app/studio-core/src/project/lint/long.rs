//! A video too long for one question: a scene whose narration runs over
//! `LONG_SCENE` (`long_scene`), and a video of more than `LONG_SCENES`
//! narrated scenes or over `LONG_VIDEO` seconds (`long_video`) unless
//! video.json says `"long": true`.

use super::{Level, LintIssue, LintReport};
use crate::error::StudioError;
use crate::project::Project;

/// A scene's narration over this is a slide being read. The calibration
/// videos (2026-10-17, 2026-11-15) ran 31-65 s in 34 of 38 narrated scenes.
pub(super) const LONG_SCENE: f64 = 30.0;
/// One question in 60-120 s takes at most this many narrated scenes...
pub(super) const LONG_SCENES: usize = 4;
/// ...and this many seconds. The calibration videos ran 375-605 s.
pub(super) const LONG_VIDEO: f64 = 150.0;

/// Scene `index`'s narration, when it runs over `LONG_SCENE`.
pub(super) fn scene(project: &Project, index: usize, report: &mut LintReport) {
    let Ok(Some(clip)) = project.narration(index) else {
        return;
    };
    if clip.duration <= LONG_SCENE {
        return;
    }
    let error = StudioError::Look {
        kind: "long_scene",
        message: format!(
            "the narration runs {:.1} s, over {LONG_SCENE:.0} s: one scene is one beat; split it into scenes, or cut what the picture already says",
            clip.duration
        ),
    };
    report.issues.push(LintIssue::scene(project, index, error));
}

/// The whole video, when it is long and not marked `long`.
pub(super) fn video(project: &Project, report: &mut LintReport) {
    if project.video.long {
        return;
    }
    let scenes = project.video.scenes.len();
    let narrated = (0..scenes)
        .filter(|&i| project.section(i).is_some())
        .count();
    let length = project.timeline().map_or(0.0, |t| t.length());
    if narrated <= LONG_SCENES && length <= LONG_VIDEO {
        return;
    }
    report.issues.push(LintIssue {
        level: Level::Error,
        group: None,
        scene: None,
        id: None,
        component: None,
        example: None,
        error: StudioError::Look {
            kind: "long_video",
            message: format!(
                "the video has {narrated} narrated scenes and runs {length:.1} s, over {LONG_SCENES} scenes or {LONG_VIDEO:.0} s: one video answers one question; cut it to that, or make the rest a later part. Set `\"long\": true` in video.json only when the student asked for a long video"
            ),
        },
    });
}
