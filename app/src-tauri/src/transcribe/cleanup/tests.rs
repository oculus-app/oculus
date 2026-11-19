use std::cell::Cell;

use serde_json::json;

use super::groq::{refusal, reply, request, MODEL};
use super::*;
use crate::test_support::{FakeKeyd, FakeServer, Reply, Scratch};
use crate::transcribe::engines::groq::{Auth, Groq};

/// A cleaner that answers `answer` and counts its calls.
struct Fake {
    answer: Result<&'static str, &'static str>,
    calls: Cell<usize>,
}

impl Fake {
    fn ok(text: &'static str) -> Self {
        Self {
            answer: Ok(text),
            calls: Cell::new(0),
        }
    }
    fn failing(error: &'static str) -> Self {
        Self {
            answer: Err(error),
            calls: Cell::new(0),
        }
    }
}

impl Clean for &Fake {
    fn clean(&self, _: &str) -> Result<String, String> {
        self.calls.set(self.calls.get() + 1);
        self.answer.map(str::to_string).map_err(str::to_string)
    }
}

#[test]
fn groq_with_a_key_answers_and_s1_is_never_asked() {
    let (groq, s1) = (Fake::ok("From Groq."), Fake::ok("From S1."));
    assert_eq!(
        run(GroqRoute::Ready(&groq), Some(&s1), "x").unwrap(),
        "From Groq."
    );
    assert_eq!(s1.calls.get(), 0);
}

#[test]
fn without_a_groq_key_s1_answers() {
    let s1 = Fake::ok("From S1.");
    assert_eq!(
        run(GroqRoute::<&Fake>::NoKey, Some(&s1), "x").unwrap(),
        "From S1."
    );
}

#[test]
fn a_failed_groq_call_falls_to_s1_when_it_is_installed() {
    let (groq, s1) = (Fake::failing("rate limited"), Fake::ok("From S1."));
    assert_eq!(
        run(GroqRoute::Ready(&groq), Some(&s1), "x").unwrap(),
        "From S1."
    );
    assert_eq!((groq.calls.get(), s1.calls.get()), (1, 1));

    let s1 = Fake::ok("From S1.");
    assert_eq!(
        run(
            GroqRoute::<&Fake>::Unreadable("keychain".into()),
            Some(&s1),
            "x"
        )
        .unwrap(),
        "From S1."
    );
}

#[test]
fn a_failed_groq_call_without_s1_surfaces_groqs_error() {
    let groq = Fake::failing("Groq's free-tier limit was hit");
    assert_eq!(
        run(GroqRoute::Ready(&groq), None::<&Fake>, "x").unwrap_err(),
        "Groq's free-tier limit was hit"
    );
}

#[test]
fn both_failing_names_both() {
    let (groq, s1) = (Fake::failing("down"), Fake::failing("loop"));
    assert_eq!(
        run(GroqRoute::Ready(&groq), Some(&s1), "x").unwrap_err(),
        "Groq: down; S1-mini: loop"
    );
}

#[test]
fn neither_says_what_to_set_up() {
    let error = run(GroqRoute::<&Fake>::NoKey, None::<&Fake>, "x").unwrap_err();
    assert_eq!(error, NOTHING);
    assert!(error.contains("Settings → Transcription"));
    assert!(error.contains("Groq API key"));
    #[cfg(target_os = "macos")]
    assert!(error.contains("S1-mini by Superwhisper"));
}

#[test]
fn the_groq_request_is_the_brief_and_the_tagged_transcript() {
    let body = request("um so why does r times x");
    assert_eq!(body["model"], MODEL);
    assert_eq!(body["model"], "qwen/qwen3.8-27b");
    assert_eq!(body["temperature"], 0);
    assert_eq!(body["reasoning_effort"], "none");
    assert_eq!(body["max_tokens"], 900);
    let messages = body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["role"], "system");
    let brief = messages[0]["content"].as_str().unwrap();
    assert!(brief.starts_with("You are a dictation cleaner, not an assistant."));
    assert!(brief.contains("\n6. Use any context only to spell names and terms correctly. Never copy it into the output.\n7. Keep every part in its original language and script. Never translate or transliterate; keep mixed-language speech as spoken.\n\nExamples:\n"));
    assert!(brief.ends_with("Make me a quiz on the last lecture, 10 questions."));
    assert_eq!(messages[1]["role"], "user");
    assert_eq!(
        messages[1]["content"],
        "<transcript>um so why does r times x</transcript>"
    );
}

#[test]
fn a_reply_is_the_first_choices_message_and_a_cut_off_one_fails() {
    let body = |content: &str, finish: &str| {
        json!({"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": finish}]})
            .to_string()
    };
    assert_eq!(reply(&body(" Hi there. \n", "stop")).unwrap(), "Hi there.");
    assert_eq!(reply(&body("", "stop")).unwrap(), "");
    assert!(reply(&body("Hi hi hi", "length")).is_err());
    assert!(reply("<html>").is_err());
}

#[test]
fn refusals_read_as_words() {
    assert!(refusal(429, r#"{"error":{"message":"Rate limit reached"}}"#).contains("free-tier"));
    assert!(refusal(401, "").contains("Settings → Transcription"));
    assert_eq!(
        refusal(400, r#"{"error":{"message":"bad model"}}"#),
        "Groq could not tidy this dictation (400): bad model"
    );
}

#[test]
fn directly_the_request_carries_the_key_and_reads_the_reply() {
    let server = FakeServer::start(|_| {
        Reply::json(
            json!({"choices": [{"message": {"content": "Hello."}, "finish_reason": "stop"}]}),
        )
    });
    let groq = Groq::at(Auth::Direct("gsk_test".into()), server.origin());
    assert_eq!(groq.clean("um hello").unwrap(), "Hello.");
    let hit = &server.hits()[0];
    assert_eq!(hit.method, "POST");
    assert_eq!(hit.url, "/chat/completions");
    assert_eq!(hit.header("authorization"), Some("Bearer gsk_test"));
    assert_eq!(hit.header("content-type"), Some("application/json"));
    assert_eq!(hit.json(), request("um hello"));
}

#[test]
fn a_429_is_a_failure_with_no_retry() {
    let server = FakeServer::start(|_| {
        Reply::status(429, json!({"error": {"message": "Rate limit reached"}}))
    });
    let groq = Groq::at(Auth::Direct("gsk_test".into()), server.origin());
    assert!(groq.clean("um hello").unwrap_err().contains("free-tier"));
    assert_eq!(server.hits().len(), 1);
}

#[test]
fn through_keyd_the_request_goes_without_the_key() {
    let dir = Scratch::new("cleanup-keyd");
    let keyd = FakeKeyd::start(&dir, |_, _| {
        let body =
            json!({"choices": [{"message": {"content": "Hello."}, "finish_reason": "stop"}]})
                .to_string()
                .into_bytes();
        (
            json!({"status": 200, "headers": [], "body_len": body.len()}),
            body,
        )
    });
    let groq = Groq::new(
        Auth::Keyd(crate::providers::credentials::Credentialed::at(&dir)),
        None,
    );
    assert_eq!(groq.clean("um hello").unwrap(), "Hello.");
    let (header, body) = &keyd.requests()[0];
    assert_eq!(header["op"], "forward");
    assert_eq!(header["secret"], "groq");
    assert_eq!(header["path"], "/openai/v1/chat/completions");
    assert!(!header.to_string().to_lowercase().contains("authorization"));
    let sent: serde_json::Value = serde_json::from_slice(body).unwrap();
    assert_eq!(sent, request("um hello"));
}
