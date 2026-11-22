//! Deleting a video's folder or one of its renders through `remove`, which
//! the commands make the Trash and the tests a plain removal. Both are
//! refused while a render or a narration of the folder runs.

use std::io::ErrorKind;
use std::path::Path;

use super::actions;
use crate::studio::render::{forget_and_prune, Preset};
use crate::studio::videos;

/// Removes the whole folder of `slug`.
pub(super) fn video_in(
    videos: &Path,
    slug: &str,
    remove: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let dir = videos::video_in(videos, slug)?;
    actions::delete(&dir, |_| remove(&dir))
}

/// Removes `renders/<preset>.mp4` and its `.vtt`, then the cache files only
/// that render used.
pub(super) fn render_in(
    videos: &Path,
    slug: &str,
    preset: &str,
    remove: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let dir = videos::video_in(videos, slug)?;
    let preset = Preset::parse(preset)?;
    actions::delete(&dir, |dir| {
        for folder in ["renders", ".cache", ".cache/segments"] {
            check_folder(&dir.join(folder))?;
        }
        let mp4 = preset.default_out(dir);
        if !mp4.is_file() {
            return Err(format!(
                "Video `{slug}` has no {} render to delete.",
                preset.name()
            ));
        }
        let vtt = mp4.with_extension("vtt");
        // Keep the MP4 available for a retry if moving the captions fails.
        if vtt.is_file() {
            remove(&vtt)?;
        }
        remove(&mp4)?;
        forget_and_prune(dir, preset).map_err(|e| e.to_string())
    })
}

/// Limit deletion and cache pruning to the video's own subdirectories.
fn check_folder(path: &Path) -> Result<(), String> {
    match path.canonicalize() {
        Ok(found) if found == path => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Ok(_) => Err(format!(
            "Studio cannot delete through the linked folder {}.",
            path.display()
        )),
        Err(e) => Err(format!("Could not open the folder {}: {e}", path.display())),
    }
}
