//! S1-mini by Superwhisper: a 0.6B text normaliser for speech-to-text output
//! (Qwen3-0.6B fine-tuned, Apache 2.0 plus a naming term), run on this Mac by
//! llama.cpp's `llama-server` sidecar with Metal. It cleans English only, a
//! transcript at a time: cut into pieces of about 1,000 tokens at sentences,
//! each sent with the fixed system prompt and control line, each output
//! capped, the outputs joined. An empty output — filler only — is an answer.

pub mod model;
pub(crate) mod server;
mod strays;
#[cfg(test)]
mod tests;
mod text;

use std::path::PathBuf;

use serde_json::Value;

pub use strays::sweep;

use super::Clean;
use crate::runtime::onnx;

const HELPER: &str = "llama-server";

/// Whether S1-mini can run on this platform at all: the sidecar is built for
/// macOS only.
pub const SUPPORTED: bool = cfg!(target_os = "macos");

/// Why S1-mini cannot run here, or `None` when it can: a platform without the
/// sidecar, or a dev checkout that never built it.
pub fn unavailable(resource_dir: Option<PathBuf>) -> Option<&'static str> {
    if !SUPPORTED {
        return Some("S1-mini by Superwhisper runs on macOS only — here dictation is tidied by Groq, with a Groq API key");
    }
    helper(resource_dir)
        .is_none()
        .then_some("the llama-server helper is missing — run `bun run llama` in app/")
}

/// `llama-server` beside the app, or dev's copy in `binaries/`.
pub fn helper(resource_dir: Option<PathBuf>) -> Option<PathBuf> {
    crate::runtime::bundled::find(HELPER, resource_dir)
}

/// The model and its licence files are all on disk.
pub fn installed() -> bool {
    onnx::is_present(&model::dir(), &model::PACK)
}

/// How a piece of transcript becomes its cleanup: the real server, or a fake
/// in tests.
pub(super) trait Complete {
    fn complete(&self, body: &Value) -> Result<Value, String>;
}

impl Complete for server::Launch {
    fn complete(&self, body: &Value) -> Result<Value, String> {
        server::complete(self, body)
    }
}

pub(super) struct S1<C> {
    pub completer: C,
    /// Whisper's code for the transcription language: `en`, `auto` or another.
    pub language: String,
}

impl S1<server::Launch> {
    /// S1-mini as installed here, or `None` when it cannot run.
    pub(super) fn installed(resource_dir: Option<PathBuf>, language: String) -> Option<Self> {
        if !installed() {
            return None;
        }
        let dir = model::dir();
        Some(Self {
            completer: server::Launch {
                helper: helper(resource_dir)?,
                model: dir.join(model::MODEL_FILE),
                log: dir.join(model::LOG_FILE),
            },
            language,
        })
    }
}

impl<C: Complete> Clean for S1<C> {
    fn clean(&self, transcript: &str) -> Result<String, String> {
        if !text::english(transcript, &self.language) {
            return Ok(transcript.to_string());
        }
        let cleaned = text::chunks(transcript, text::CHUNK_TOKENS)
            .iter()
            .map(|piece| reply(&self.completer.complete(&text::request(piece))?))
            .collect::<Result<Vec<_>, String>>()?;
        Ok(text::join(&cleaned))
    }
}

/// Whether this cleanup would run S1-mini at all: English speech only.
pub(super) fn would_run(transcript_language: &str) -> bool {
    text::english("", transcript_language)
}

/// The first choice's text. Output that hit its cap is a loop, not a cleanup.
fn reply(value: &Value) -> Result<String, String> {
    let choice = &value["choices"][0];
    if choice["finish_reason"] == "length" {
        return Err("S1-mini's output ran past its length cap".into());
    }
    choice["message"]["content"]
        .as_str()
        .map(|text| text.trim().to_string())
        .ok_or_else(|| "S1-mini's reply held no message".into())
}
