//! Cleanup on Groq: one chat completion with Qwen 3.8 27B, sent the way
//! transcription sends its audio — through keyd when it is installed, so the
//! key never enters this process, else with the keychain's key
//! (`settings::groq_auth`).

use serde_json::{json, Value};

use super::brief::BRIEF;
use super::Clean;
use crate::transcribe::engines::groq::Groq;
use crate::transcribe::EngineError;

pub(super) const MODEL: &str = "qwen/qwen3.8-27b";

/// Qwen's free-tier output cap is 1,000 tokens.
const MAX_TOKENS: u32 = 900;

/// The request body: the brief, then the transcript in its tags and nothing else.
pub(super) fn request(transcript: &str) -> Value {
    json!({
        "model": MODEL,
        "temperature": 0,
        "reasoning_effort": "none",
        "max_tokens": MAX_TOKENS,
        "messages": [
            {"role": "system", "content": BRIEF},
            {"role": "user", "content": format!("<transcript>{transcript}</transcript>")},
        ],
    })
}

impl Clean for Groq {
    fn clean(&self, transcript: &str) -> Result<String, String> {
        let body = request(transcript).to_string();
        // keyd's refusals arrive already in words (`engines::groq::keyd_error`).
        let response = self
            .chat(body.as_bytes())
            .map_err(|e: EngineError| e.to_string())?;
        let text = String::from_utf8_lossy(&response.body);
        if response.status >= 400 {
            return Err(refusal(response.status, &text));
        }
        reply(&text)
    }
}

/// The first choice's message. A reply cut off at the token cap is a failure,
/// not a shorter message.
pub(super) fn reply(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body)
        .map_err(|e| format!("Groq's reply was not a chat completion: {e}"))?;
    let choice = &value["choices"][0];
    if choice["finish_reason"] == "length" {
        return Err("Groq's cleanup ran past its length limit".into());
    }
    choice["message"]["content"]
        .as_str()
        .map(|text| text.trim().to_string())
        .ok_or_else(|| "Groq's reply held no message".into())
}

/// A refused request in words. 429 is the free tier's limit; it is a failure
/// like any other here (S1-mini answers instead when it is installed).
pub(super) fn refusal(status: u16, body: &str) -> String {
    let message = crate::providers::groq::message_of(body);
    match (status, message) {
        (429, _) => "Groq's free-tier limit was hit — try again later".into(),
        (401 | 403, _) => {
            "Groq rejected the saved key — replace it in Settings → Transcription".into()
        }
        (_, Some(message)) => format!("Groq could not tidy this dictation ({status}): {message}"),
        (_, None) => format!("Groq could not tidy this dictation ({status})"),
    }
}
