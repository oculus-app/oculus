//! `oculus studio beats`: one scene's timeline of what changes on screen
//! (`SceneLook::beats`), as a summary of at most `SUMMARY` lines
//! (`Beat::summary`), or with `--key` one entity's every beat.

use super::studio_error;
use crate::*;
use app_lib::studio::{brief, libraries};
use studio_core::{Beat, SceneLook};

/// Lines the summary prints at most.
pub(super) const SUMMARY: usize = 20;

impl Ctx {
    pub(crate) fn studio_beats(&self, args: &StudioBeatsArgs) -> Result<(), String> {
        let project = libraries::open(&args.dir, None, None).map_err(studio_error)?;
        let index = brief::scene_index(&project, &args.scene)?;
        let look = project
            .look(&[index])
            .pop()
            .ok_or("no samples")?
            .map_err(studio_error)?;
        let beats = look.beats();
        if self.json {
            return self.emit(&serde_json::json!({
                "index": index,
                "id": look.id,
                "component": look.component,
                "length": look.length,
                "beats": beats,
            }));
        }
        print!("{}", text(&look, &beats, args.key.as_deref())?);
        Ok(())
    }
}

/// What `beats` prints: a head line, then the summary and how to see more,
/// or every beat about `key`.
pub(super) fn text(look: &SceneLook, beats: &[Beat], key: Option<&str>) -> Result<String, String> {
    let head = |n: usize, what: &str| {
        format!(
            "{} ({}), {:.2} s, {n} beat{}{what}; scene seconds\n",
            look.name(),
            look.component,
            look.length,
            if n == 1 { "" } else { "s" },
        )
    };
    let Some(key) = key else {
        let lines = Beat::summary(beats, SUMMARY);
        let what = if lines.len() < beats.len() {
            format!(" in {} lines", lines.len())
        } else {
            String::new()
        };
        let mut out = head(beats.len(), &what);
        for l in &lines {
            out.push_str(l);
            out.push('\n');
        }
        if lines.len() < beats.len() {
            out.push_str("--key K prints every beat of one key; --json every beat\n");
        }
        return Ok(out);
    };
    let about: Vec<&Beat> = beats.iter().filter(|b| b.is_about(key)).collect();
    if about.is_empty() {
        return Err(format!(
            "no beat moves `{key}` in {}; the summary names the keys that move",
            look.name()
        ));
    }
    let mut out = head(about.len(), &format!(" of `{key}`"));
    for b in about {
        out.push_str(&b.line());
        out.push('\n');
    }
    Ok(out)
}
