use std::path::{Component, Path};

use serde::Deserialize;
use serde_json::Value;
use studio_core::Library;

use super::edit::{edit_video_json, with_key, without_key};
use crate::studio::voice::{self, VoiceSettings};

/// Selects a named theme through the same cascade as a render.
pub fn set_theme(dir: &Path, theme: &str, library: &Library) -> Result<(), String> {
    if theme.ends_with(".json")
        || theme.contains(['/', '\\'])
        || !matches!(
            Path::new(theme).components().next(),
            Some(Component::Normal(_))
        )
    {
        return Err(format!(
            "choose a theme name; `{theme}` is not a theme name"
        ));
    }
    #[derive(Deserialize)]
    struct Subject {
        subject: Option<String>,
    }
    edit_video_json(dir, |text| {
        let video: Subject = serde_json::from_str(text).map_err(|e| e.to_string())?;
        library
            .resolve_theme(dir, video.subject.as_deref(), theme)
            .map_err(|e| format!("cannot use theme `{theme}`: {e}"))?;
        with_key(
            text,
            "theme",
            &Value::from(theme).to_string(),
            Some("scenes"),
        )
    })
}

/// Changes just the voice id, validating the result against Settings before writing.
pub fn set_voice(dir: &Path, id: Option<String>, settings: &VoiceSettings) -> Result<(), String> {
    #[derive(Deserialize)]
    struct VideoVoice {
        voice: Option<serde_json::Map<String, Value>>,
    }
    edit_video_json(dir, |text| {
        let video: VideoVoice = serde_json::from_str(text).map_err(|e| e.to_string())?;
        let mut block = video.voice.unwrap_or_default();
        match id {
            Some(id) => block.insert("voice".to_owned(), Value::String(id)),
            None => block.remove("voice"),
        };
        let empty = block.is_empty();
        let literal = Value::Object(block);
        let edited: studio_core::Voice =
            serde_json::from_value(literal.clone()).map_err(|e| e.to_string())?;
        voice::resolve_video(Some(&edited), settings)?;
        if empty {
            without_key(text, "voice")
        } else {
            with_key(text, "voice", &literal.to_string(), Some("scenes"))
        }
    })
}
