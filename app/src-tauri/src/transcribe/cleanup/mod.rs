//! Dictation cleanup: a microphone transcript (`transcribe::dictation`) into
//! the message the speaker meant to type, without a chat thread.
//!
//! Settings → Transcription chooses the model ([`Choice`]): Groq's Qwen 3.8
//! 27B on the Groq API key transcription uses (`groq.rs`), S1-mini by
//! Superwhisper on this Mac (`s1/`), or Off, which inserts the transcript as
//! heard. With the fallback on, the other model answers when the chosen one
//! is not set up or fails. The default is Groq with S1-mini as its fallback.

mod brief;
pub mod commands;
mod groq;
pub mod s1;
#[cfg(test)]
mod tests;

/// One way of cleaning a transcript.
pub(super) trait Clean {
    fn clean(&self, transcript: &str) -> Result<String, String>;
}

/// Groq as this machine has it.
pub(super) enum GroqRoute<G> {
    /// No key in keyd or the keychain.
    NoKey,
    /// A key may be there, but keyd or the keychain refused to say.
    Unreadable(String),
    Ready(G),
}

/// A model that tidies dictation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Engine {
    Groq,
    S1Mini,
}

impl Engine {
    /// The stored and wire name.
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Groq => "groq",
            Self::S1Mini => "s1Mini",
        }
    }

    fn other(self) -> Self {
        match self {
            Self::Groq => Self::S1Mini,
            Self::S1Mini => Self::Groq,
        }
    }
}

/// How dictation is tidied: the `transcribe` row's `cleanup` (the model) and
/// `cleanupFallback`, written from Settings → Transcription.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Choice {
    /// No cleanup: the transcript is inserted as heard.
    Off,
    /// `first` cleans; with `fallback`, the other model answers when `first`
    /// is not set up or fails.
    Clean { first: Engine, fallback: bool },
}

impl Choice {
    /// Groq with S1-mini behind it, the default.
    pub(crate) const DEFAULT: Self = Self::Clean {
        first: Engine::Groq,
        fallback: true,
    };

    /// A missing or unknown model (and `auto`, the older name for the
    /// default) is Groq; a missing fallback is on for the default and off
    /// for a model chosen by name, as those meant before it was stored.
    pub(crate) fn from_setting(cleanup: Option<&str>, fallback: Option<bool>) -> Self {
        let first = match cleanup {
            Some("off") => return Self::Off,
            Some("groq") => Engine::Groq,
            Some("s1Mini") => Engine::S1Mini,
            _ => {
                return match fallback {
                    Some(fallback) => Self::Clean {
                        first: Engine::Groq,
                        fallback,
                    },
                    None => Self::DEFAULT,
                }
            }
        };
        Self::Clean {
            first,
            fallback: fallback.unwrap_or(false),
        }
    }

    /// The stored `cleanup`: `groq`, `s1Mini` or `off`.
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::Clean { first, .. } => first.name(),
        }
    }

    /// The stored `cleanupFallback`.
    pub(crate) fn fallback(self) -> bool {
        matches!(self, Self::Clean { fallback: true, .. })
    }
}

#[cfg(target_os = "macos")]
pub(super) const NOTHING: &str = "Dictation cleanup needs a Groq API key or S1-mini by Superwhisper — add a key or download S1-mini in Settings → Transcription.";
#[cfg(not(target_os = "macos"))]
pub(super) const NOTHING: &str =
    "Dictation cleanup needs a Groq API key — add one in Settings → Transcription.";

pub(super) const GROQ_NO_KEY: &str = "Dictation cleanup is set to Groq, but no Groq API key is saved — add one in Settings → Transcription, or choose another cleanup there.";

#[cfg(target_os = "macos")]
pub(super) const S1_MISSING: &str = "Dictation cleanup is set to S1-mini by Superwhisper, but it isn't downloaded — download it in Settings → Transcription, or choose another cleanup there.";
#[cfg(not(target_os = "macos"))]
pub(super) const S1_MISSING: &str = "Dictation cleanup is set to S1-mini by Superwhisper, which runs on macOS only — choose another cleanup in Settings → Transcription.";

/// One model's go at a transcript.
enum Attempt {
    Cleaned(String),
    /// Not set up: no key, or not downloaded here.
    Missing(&'static str),
    Failed(String),
}

fn with_groq<G: Clean>(route: GroqRoute<G>, transcript: &str) -> Attempt {
    match route {
        GroqRoute::Ready(groq) => match groq.clean(transcript) {
            Ok(cleaned) => Attempt::Cleaned(cleaned),
            Err(e) => Attempt::Failed(e),
        },
        GroqRoute::Unreadable(e) => Attempt::Failed(e),
        GroqRoute::NoKey => Attempt::Missing(GROQ_NO_KEY),
    }
}

fn with_s1<S: Clean>(s1: Option<S>, transcript: &str) -> Attempt {
    match s1 {
        Some(s1) => match s1.clean(transcript) {
            Ok(cleaned) => Attempt::Cleaned(cleaned),
            Err(e) => Attempt::Failed(e),
        },
        None => Attempt::Missing(S1_MISSING),
    }
}

fn label(engine: Engine) -> &'static str {
    match engine {
        Engine::Groq => "Groq",
        Engine::S1Mini => "S1-mini",
    }
}

/// The transcript cleaned as `choice` says. Each route is read only when an
/// attempt needs it, so S1-mini and Off never touch keyd or the keychain
/// unless Groq is the fallback, and Groq never loads S1-mini unless it is.
pub(super) fn run<G: Clean, S: Clean>(
    choice: Choice,
    groq: impl FnOnce() -> GroqRoute<G>,
    s1: impl FnOnce() -> Option<S>,
    transcript: &str,
) -> Result<String, String> {
    let Choice::Clean { first, fallback } = choice else {
        return Ok(transcript.to_string());
    };
    let (mut groq, mut s1) = (Some(groq), Some(s1));
    let mut attempt = |engine: Engine| match engine {
        Engine::Groq => groq.take().map(|route| with_groq(route(), transcript)),
        Engine::S1Mini => s1.take().map(|route| with_s1(route(), transcript)),
    };
    let tried = attempt(first).expect("the first attempt");
    let tried = match tried {
        Attempt::Cleaned(cleaned) => return Ok(cleaned),
        Attempt::Missing(message) if !fallback => return Err(message.into()),
        Attempt::Failed(e) if !fallback => return Err(e),
        tried => tried,
    };
    let second = first.other();
    match (tried, attempt(second).expect("the fallback attempt")) {
        (tried, Attempt::Cleaned(cleaned)) => {
            if let Attempt::Failed(e) = tried {
                elog!(
                    "[oculus] dictation cleanup: {} failed ({e}); {} answers",
                    label(first),
                    label(second)
                );
            }
            Ok(cleaned)
        }
        (Attempt::Failed(e), Attempt::Failed(second_error)) => Err(format!(
            "{}: {e}; {}: {second_error}",
            label(first),
            label(second)
        )),
        (Attempt::Failed(e), _) | (_, Attempt::Failed(e)) => Err(e),
        _ => Err(NOTHING.into()),
    }
}

/// What a cleanup tries first under `choice`, for `dictation_cleanup_status`:
/// `groq`, `s1Mini`, `off`, or `none` when the choice has nothing set up.
pub(super) fn first_engine(choice: Choice, groq_key: bool, s1_ready: bool) -> &'static str {
    let ready = |engine: Engine| match engine {
        Engine::Groq => groq_key,
        Engine::S1Mini => s1_ready,
    };
    match choice {
        Choice::Off => "off",
        Choice::Clean { first, .. } if ready(first) => first.name(),
        Choice::Clean {
            first,
            fallback: true,
        } if ready(first.other()) => first.other().name(),
        Choice::Clean { .. } => "none",
    }
}

/// Whether a recording's start should load S1-mini: when it is the model, or
/// when it is Groq's fallback and Groq has no key (asked only then).
pub(super) fn warms_s1(choice: Choice, groq_key: impl FnOnce() -> bool) -> bool {
    match choice {
        Choice::Clean {
            first: Engine::S1Mini,
            ..
        } => true,
        Choice::Clean {
            first: Engine::Groq,
            fallback: true,
        } => !groq_key(),
        Choice::Clean { .. } | Choice::Off => false,
    }
}
