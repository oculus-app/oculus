//! What a video is called: video.json's `title`, else its title card's
//! text, else its slug spelled out. `oculus studio title` sets `title` in
//! the text (`edit`); the folder, and so the slug, never changes.

use std::path::Path;

use studio_core::Video;

use super::edit::{edit_video_json, with_key};

/// The name of the video `slug`, whose video.json is `video` (`None` when it
/// does not load): its `title`, else the first scene's `title` prop when
/// that scene is a `TitleCard`, else [`title_of`] the slug.
pub fn video_title(video: Option<&Video>, slug: &str) -> String {
    let named = |t: &str| Some(t.trim()).filter(|t| !t.is_empty()).map(str::to_owned);
    video
        .and_then(|v| {
            v.title.as_deref().and_then(named).or_else(|| {
                let first = v.scenes.first().filter(|s| s.component == "TitleCard")?;
                first.props.get("title")?.as_str().and_then(named)
            })
        })
        .unwrap_or_else(|| title_of(slug))
}

/// `gradient-descent` -> `Gradient descent`; the name of a video with no
/// title and no title card.
pub fn title_of(slug: &str) -> String {
    let words = slug.replace('-', " ");
    let mut chars = words.trim().chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

/// Sets `<dir>/video.json`'s `title`, trimmed; nothing else in the folder
/// changes. Refuses an empty title.
pub fn set_title(dir: &Path, title: &str) -> Result<(), String> {
    let title = checked(title)?;
    edit_video_json(dir, |text| with_title(text, title))
}

/// `text` with its top-level `title` set, added as the first key when it is
/// missing.
pub fn with_title(text: &str, title: &str) -> Result<String, String> {
    let literal = serde_json::to_string(checked(title)?).map_err(|e| e.to_string())?;
    with_key(text, "title", &literal, None)
}

fn checked(title: &str) -> Result<&str, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("a video's title cannot be empty".to_owned());
    }
    Ok(title)
}
