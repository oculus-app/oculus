use studio_core::Project;

use super::{ServerSpeaker, Speaker};
use crate::studio::tts::kokoro::{KokoroSpeaker, LexiconFiles, Packs};
use crate::studio::voice::lint::{notes, Note};
use crate::studio::voice::Voice;

/// The speaker `voice`'s engine makes clips with; Kokoro reads the
/// lexicon of `subject` over the library's.
pub fn speaker<'a>(voice: &'a Voice, subject: Option<&str>) -> Speakers<'a> {
    match voice {
        Voice::Server(v) => Speakers::Server(ServerSpeaker(v)),
        Voice::Kokoro(v) => Speakers::Kokoro(Box::new(KokoroSpeaker::new(
            v.clone(),
            Packs::app(),
            LexiconFiles::app(subject),
        ))),
    }
}

pub enum Speakers<'a> {
    Server(ServerSpeaker<'a>),
    Kokoro(Box<KokoroSpeaker>),
}

impl Speakers<'_> {
    pub fn speaker(&self) -> &dyn Speaker {
        match self {
            Speakers::Server(s) => s,
            Speakers::Kokoro(s) => &**s,
        }
    }

    /// A note per word Kokoro guessed in the scenes it read.
    pub fn notes(&self, project: &Project) -> Vec<Note> {
        match self {
            Speakers::Server(_) => Vec::new(),
            Speakers::Kokoro(k) => notes(project, |text| k.phonemized(text)),
        }
    }
}
