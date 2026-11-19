//! Dictation cleanup: a microphone transcript (`transcribe::dictation`) into
//! the message the speaker meant to type, without a chat thread.
//!
//! Settings → Transcription chooses the engine ([`Choice`]). Automatic, the
//! default: with a Groq API key — the one transcription uses — Groq's Qwen
//! 3.8 27B cleans it (`groq.rs`); without one, S1-mini by Superwhisper does,
//! on this Mac (`s1/`); when Groq fails, S1-mini answers if it is installed,
//! else Groq's error surfaces. Groq or S1-mini alone use only that engine,
//! and Off inserts the transcript as heard.

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

/// Which engine tidies dictation: the `transcribe` row's `cleanup` key,
/// written from Settings → Transcription.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Choice {
    /// Groq with a key, else S1-mini; S1-mini also when Groq fails.
    Auto,
    /// Groq alone, with no fallback.
    Groq,
    /// S1-mini alone; dictation never goes to Groq.
    S1Mini,
    /// No cleanup: the transcript is inserted as heard.
    Off,
}

impl Choice {
    /// A missing or unknown value is [`Choice::Auto`].
    pub(crate) fn from_setting(value: Option<&str>) -> Self {
        match value {
            Some("groq") => Self::Groq,
            Some("s1Mini") => Self::S1Mini,
            Some("off") => Self::Off,
            _ => Self::Auto,
        }
    }

    /// The stored and wire name.
    pub(crate) fn name(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Groq => "groq",
            Self::S1Mini => "s1Mini",
            Self::Off => "off",
        }
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

/// The transcript cleaned by the engine `choice` names. Each route is read
/// only when the choice needs it, so S1-mini and Off never touch keyd or the
/// keychain, and Groq and Off never load S1-mini.
pub(super) fn run<G: Clean, S: Clean>(
    choice: Choice,
    groq: impl FnOnce() -> GroqRoute<G>,
    s1: impl FnOnce() -> Option<S>,
    transcript: &str,
) -> Result<String, String> {
    match choice {
        Choice::Off => Ok(transcript.to_string()),
        Choice::Groq => match groq() {
            GroqRoute::Ready(groq) => groq.clean(transcript),
            GroqRoute::Unreadable(e) => Err(e),
            GroqRoute::NoKey => Err(GROQ_NO_KEY.into()),
        },
        Choice::S1Mini => match s1() {
            Some(s1) => s1.clean(transcript),
            None => Err(S1_MISSING.into()),
        },
        Choice::Auto => automatic(groq(), s1, transcript),
    }
}

/// Groq first when it has a key; S1-mini when Groq has none or fails.
fn automatic<S: Clean>(
    groq: GroqRoute<impl Clean>,
    s1: impl FnOnce() -> Option<S>,
    transcript: &str,
) -> Result<String, String> {
    let groq_failed = match groq {
        GroqRoute::Ready(groq) => match groq.clean(transcript) {
            Ok(cleaned) => return Ok(cleaned),
            Err(e) => Some(e),
        },
        GroqRoute::Unreadable(e) => Some(e),
        GroqRoute::NoKey => None,
    };
    match (groq_failed, s1()) {
        (Some(e), Some(s1)) => {
            elog!("[oculus] dictation cleanup: Groq failed ({e}); S1-mini answers");
            s1.clean(transcript)
                .map_err(|s1_error| format!("Groq: {e}; S1-mini: {s1_error}"))
        }
        (None, Some(s1)) => s1.clean(transcript),
        (Some(e), None) => Err(e),
        (None, None) => Err(NOTHING.into()),
    }
}

/// What a cleanup tries first under `choice`, for `dictation_cleanup_status`:
/// `groq`, `s1Mini`, `off`, or `none` when the choice has nothing set up.
pub(super) fn first_engine(choice: Choice, groq_key: bool, s1_ready: bool) -> &'static str {
    match (choice, groq_key, s1_ready) {
        (Choice::Off, _, _) => "off",
        (Choice::Auto | Choice::Groq, true, _) => "groq",
        (Choice::Auto | Choice::S1Mini, _, true) => "s1Mini",
        _ => "none",
    }
}

/// Whether a recording's start should load S1-mini: when it is the choice,
/// or when Automatic finds no Groq key (asked only then).
pub(super) fn warms_s1(choice: Choice, groq_key: impl FnOnce() -> bool) -> bool {
    match choice {
        Choice::S1Mini => true,
        Choice::Auto => !groq_key(),
        Choice::Groq | Choice::Off => false,
    }
}
