//! Dictation cleanup: a microphone transcript (`transcribe::dictation`) into
//! the message the speaker meant to type, without a chat thread.
//!
//! With a Groq API key — the one transcription uses — Groq's Qwen 3.8 27B
//! cleans it (`groq.rs`). Without one, S1-mini by Superwhisper does, on this
//! Mac (`s1/`). When Groq fails, S1-mini answers if it is installed, else
//! Groq's error surfaces. With neither, the error says to add a key or
//! download S1-mini in Settings → Transcription.

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

#[cfg(target_os = "macos")]
pub(super) const NOTHING: &str = "Dictation cleanup needs a Groq API key or S1-mini by Superwhisper — add a key or download S1-mini in Settings → Transcription.";
#[cfg(not(target_os = "macos"))]
pub(super) const NOTHING: &str =
    "Dictation cleanup needs a Groq API key — add one in Settings → Transcription.";

/// Groq first when it has a key; S1-mini when Groq has none or fails.
pub(super) fn run(
    groq: GroqRoute<impl Clean>,
    s1: Option<impl Clean>,
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
    match (groq_failed, s1) {
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
