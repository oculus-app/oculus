use serde::Serialize;
use studio_core::{Manifest, Project};

use super::{
    clip_matches, existing_clip, narrated_scenes, no_script, speaker, NarrateError, Speakers,
};
use crate::studio::timing;
use crate::studio::voice::{self, VoiceSettings};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NarrationStatus {
    pub engine: Option<String>,
    pub voice: Option<String>,
    pub scenes: u32,
    pub stale: u32,
    pub problem: Option<String>,
}

/// Inspect the video and its cache without synthesising or aligning any audio.
pub fn status(project: &Project, settings: &VoiceSettings) -> NarrationStatus {
    let scenes = narrated_scenes(project);
    let mut status = NarrationStatus {
        engine: None,
        voice: None,
        scenes: scenes.len() as u32,
        stale: scenes.len() as u32,
        problem: None,
    };
    let voice = voice::resolve_video(project.video.voice.as_ref(), settings);
    if let Ok(voice) = &voice {
        let (engine, id) = voice.engine_and_id();
        status.engine = Some(engine.as_str().to_owned());
        status.voice = Some(id.to_owned());
    }
    if project.script.is_none() {
        status.problem = Some(no_script(&project.dir));
        return status;
    }
    let voice = match voice {
        Ok(voice) => voice,
        Err(error) => {
            status.problem = Some(without_flag_hint(error));
            return status;
        }
    };
    let mut speakers = speaker(&voice, project.video.subject.as_deref());
    if let Speakers::Kokoro(kokoro) = &mut speakers {
        kokoro.defer_guesser();
    }
    if let Ok(Some(manifest)) = Manifest::read(&project.dir) {
        let clips = project.dir.join("narration");
        for scene in scenes {
            let Some(clip) = existing_clip(&manifest, &clips, &scene.id) else {
                continue;
            };
            match scene.key(speakers.speaker()) {
                Ok(key) if clip_matches(clip, &key) => status.stale -= 1,
                Ok(_) => {}
                Err(error) => {
                    status
                        .problem
                        .get_or_insert_with(|| NarrateError::scene(&scene.id, error).to_string());
                }
            }
        }
    }
    if status.problem.is_none() {
        status.problem = match &speakers {
            Speakers::Kokoro(kokoro) => kokoro.check_files().err(),
            Speakers::Server(_) => None,
        }
        .or_else(|| timing::resolve_model().err().map(|e| e.to_string()));
    }
    status
}

/// A resolve failure without the CLI's "or pass --flag" hint, which the page
/// cannot follow.
fn without_flag_hint(error: String) -> String {
    match error.split_once(", or pass --") {
        Some((head, _)) => head.to_owned(),
        None => error,
    }
}
