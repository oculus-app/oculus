//! Turning a video's burned-in captions on or off: video.json's top-level
//! `captions`, edited in the text (`edit`).

use std::path::Path;

use super::edit::{edit_video_json, with_key};

/// Sets `<dir>/video.json`'s `captions` to `on`. Refuses a file that is not
/// a JSON object or whose `captions` is not `true` or `false`.
pub fn set_captions(dir: &Path, on: bool) -> Result<(), String> {
    edit_video_json(dir, |text| with_captions(text, on))
}

/// `text` with its top-level `captions` set to `on`, added before `scenes`
/// when it is missing.
pub fn with_captions(text: &str, on: bool) -> Result<String, String> {
    let value: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("not valid JSON: {e}"))?;
    if value.get("captions").is_some_and(|v| !v.is_boolean()) {
        return Err("`captions` must be true or false".to_owned());
    }
    with_key(
        text,
        "captions",
        if on { "true" } else { "false" },
        Some("scenes"),
    )
}
