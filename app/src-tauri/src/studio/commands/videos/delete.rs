//! Deleting a video's folder or one of its renders through `remove`, which
//! the commands make the Trash and the tests a plain removal. Both are
//! refused while a render or a narration of the folder runs.

use std::io::ErrorKind;
use std::path::{Path, PathBuf};

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
#[cfg(test)]
pub(super) fn render_in(
    videos: &Path,
    slug: &str,
    preset: &str,
    remove: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    render_to_trash(videos, slug, preset, &|path| remove(path).map(|()| None))?;
    forget_render(videos, slug, preset)
}

/// What `render_to_trash` sent: each file and where the Trash put it, and
/// the captions' bytes as they were.
pub(super) struct TrashedRender {
    pub files: Vec<(PathBuf, Option<PathBuf>)>,
    pub captions: Option<Vec<u8>>,
}

/// Sends `renders/<preset>.mp4` and its `.vtt` to `trash`, keeping its cache
/// record, so Undo can put the render back whole; `forget_render` drops the
/// record once the delete is final. When the mp4 cannot go, the captions
/// come back.
pub(super) fn render_to_trash(
    videos: &Path,
    slug: &str,
    preset: &str,
    trash: &dyn Fn(&Path) -> Result<Option<PathBuf>, String>,
) -> Result<TrashedRender, String> {
    let dir = videos::video_in(videos, slug)?;
    let preset = Preset::parse(preset)?;
    let mut sent = None;
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
        let captions = std::fs::read(&vtt).ok();
        let mut files = Vec::new();
        if vtt.is_file() {
            files.push((vtt.clone(), trash(&vtt)?));
        }
        match trash(&mp4) {
            Ok(at) => files.push((mp4, at)),
            Err(e) => {
                if let Some((vtt, Some(at))) = files.first() {
                    let _ = std::fs::rename(at, vtt);
                }
                return Err(e);
            }
        }
        sent = Some(TrashedRender { files, captions });
        Ok(())
    })?;
    sent.ok_or_else(|| "The render was not moved.".to_string())
}

/// Drops the render's cache record and the cache files only it used, unless
/// a render of the preset is back (an Undo, or rendered again since).
pub(super) fn forget_render(videos: &Path, slug: &str, preset: &str) -> Result<(), String> {
    let dir = videos::video_in(videos, slug)?;
    let preset = Preset::parse(preset)?;
    actions::delete(&dir, |dir| {
        if preset.default_out(dir).is_file() {
            return Ok(());
        }
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
