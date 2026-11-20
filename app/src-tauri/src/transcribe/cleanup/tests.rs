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

/// `run` under `choice` with these routes, counting each route's reads.
fn clean(
    choice: Choice,
    groq: GroqRoute<&Fake>,
    s1: Option<&Fake>,
    reads: &Cell<(usize, usize)>,
) -> Result<String, String> {
    run(
        choice,
        || {
            reads.set((reads.get().0 + 1, reads.get().1));
            groq
        },
        || {
            reads.set((reads.get().0, reads.get().1 + 1));
            s1
        },
        "x",
    )
}

const GROQ: Choice = Choice::Clean {
    first: Engine::Groq,
    fallback: false,
};
const S1: Choice = Choice::Clean {
    first: Engine::S1Mini,
    fallback: false,
};
const S1_THEN_GROQ: Choice = Choice::Clean {
    first: Engine::S1Mini,
    fallback: true,
};

/// The default: Groq, with S1-mini as its fallback.
fn auto(groq: GroqRoute<&Fake>, s1: Option<&Fake>) -> Result<String, String> {
    clean(Choice::DEFAULT, groq, s1, &Cell::new((0, 0)))
}

#[test]
fn groq_with_a_key_answers_and_s1_is_never_asked() {
    let (groq, s1) = (Fake::ok("From Groq."), Fake::ok("From S1."));
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(Choice::DEFAULT, GroqRoute::Ready(&groq), Some(&s1), &reads).unwrap(),
        "From Groq."
    );
    assert_eq!(s1.calls.get(), 0);
    assert_eq!(reads.get(), (1, 0), "S1-mini is not even loaded");
}

#[test]
fn without_a_groq_key_s1_answers() {
    let s1 = Fake::ok("From S1.");
    assert_eq!(auto(GroqRoute::NoKey, Some(&s1)).unwrap(), "From S1.");
}

#[test]
fn a_failed_groq_call_falls_to_s1_when_it_is_installed() {
    let (groq, s1) = (Fake::failing("rate limited"), Fake::ok("From S1."));
    assert_eq!(
        auto(GroqRoute::Ready(&groq), Some(&s1)).unwrap(),
        "From S1."
    );
    assert_eq!((groq.calls.get(), s1.calls.get()), (1, 1));

    let s1 = Fake::ok("From S1.");
    assert_eq!(
        auto(GroqRoute::Unreadable("keychain".into()), Some(&s1)).unwrap(),
        "From S1."
    );
}

#[test]
fn a_failed_groq_call_without_s1_surfaces_groqs_error() {
    let groq = Fake::failing("Groq's free-tier limit was hit");
    assert_eq!(
        auto(GroqRoute::Ready(&groq), None).unwrap_err(),
        "Groq's free-tier limit was hit"
    );
}

#[test]
fn both_failing_names_both_in_the_order_tried() {
    let (groq, s1) = (Fake::failing("down"), Fake::failing("loop"));
    assert_eq!(
        auto(GroqRoute::Ready(&groq), Some(&s1)).unwrap_err(),
        "Groq: down; S1-mini: loop"
    );
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(S1_THEN_GROQ, GroqRoute::Ready(&groq), Some(&s1), &reads).unwrap_err(),
        "S1-mini: loop; Groq: down"
    );
}

#[test]
fn neither_says_what_to_set_up() {
    let error = auto(GroqRoute::NoKey, None).unwrap_err();
    assert_eq!(error, NOTHING);
    assert!(error.contains("Settings → Transcription"));
    assert!(error.contains("Groq API key"));
    #[cfg(target_os = "macos")]
    assert!(error.contains("S1-mini by Superwhisper"));
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(S1_THEN_GROQ, GroqRoute::NoKey, None, &reads).unwrap_err(),
        NOTHING
    );
}

#[test]
fn s1_first_falls_to_groq_when_it_is_missing_or_fails() {
    let (groq, failing) = (Fake::ok("From Groq."), Fake::failing("loop"));
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(S1_THEN_GROQ, GroqRoute::Ready(&groq), None, &reads).unwrap(),
        "From Groq."
    );
    assert_eq!(
        clean(
            S1_THEN_GROQ,
            GroqRoute::Ready(&groq),
            Some(&failing),
            &reads
        )
        .unwrap(),
        "From Groq."
    );
    assert_eq!(
        clean(S1_THEN_GROQ, GroqRoute::NoKey, Some(&failing), &reads).unwrap_err(),
        "loop"
    );

    let (groq, s1) = (Fake::ok("From Groq."), Fake::ok("From S1."));
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(S1_THEN_GROQ, GroqRoute::Ready(&groq), Some(&s1), &reads).unwrap(),
        "From S1."
    );
    assert_eq!(
        (groq.calls.get(), reads.get()),
        (0, (0, 1)),
        "Groq's key is not even read"
    );
}

#[test]
fn groq_alone_never_falls_to_s1() {
    let (groq, s1) = (
        Fake::failing("Groq's free-tier limit was hit"),
        Fake::ok("From S1."),
    );
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(GROQ, GroqRoute::Ready(&groq), Some(&s1), &reads).unwrap_err(),
        "Groq's free-tier limit was hit"
    );
    assert_eq!((s1.calls.get(), reads.get()), (0, (1, 0)));

    let groq = Fake::ok("From Groq.");
    assert_eq!(
        clean(GROQ, GroqRoute::Ready(&groq), Some(&s1), &reads).unwrap(),
        "From Groq."
    );
    let error = clean(GROQ, GroqRoute::NoKey, Some(&s1), &reads).unwrap_err();
    assert_eq!(error, GROQ_NO_KEY);
    assert!(error.contains("no Groq API key"));
    assert_eq!(
        clean(
            GROQ,
            GroqRoute::Unreadable("keychain refused".into()),
            Some(&s1),
            &reads
        )
        .unwrap_err(),
        "keychain refused"
    );
    assert_eq!(s1.calls.get(), 0);
}

#[test]
fn s1_alone_never_reads_groqs_key() {
    let (groq, s1) = (Fake::ok("From Groq."), Fake::ok("From S1."));
    let reads = Cell::new((0, 0));
    assert_eq!(
        clean(S1, GroqRoute::Ready(&groq), Some(&s1), &reads).unwrap(),
        "From S1."
    );
    assert_eq!((groq.calls.get(), reads.get()), (0, (0, 1)));

    let failing = Fake::failing("loop");
    assert_eq!(
        clean(S1, GroqRoute::Ready(&groq), Some(&failing), &reads).unwrap_err(),
        "loop"
    );
    let error = clean(S1, GroqRoute::Ready(&groq), None, &reads).unwrap_err();
    assert_eq!(error, S1_MISSING);
    assert!(error.contains("S1-mini by Superwhisper"));
    assert_eq!(groq.calls.get(), 0);
    assert_eq!(reads.get().0, 0);
}

#[test]
fn off_returns_the_transcript_as_heard_and_reads_nothing() {
    let (groq, s1) = (Fake::ok("From Groq."), Fake::ok("From S1."));
    let reads = Cell::new((0, 0));
    assert_eq!(
        run(
            Choice::Off,
            || {
                reads.set((1, 0));
                GroqRoute::Ready(&groq)
            },
            || {
                reads.set((0, 1));
                Some(&s1)
            },
            "um so  this is it",
        )
        .unwrap(),
        "um so  this is it"
    );
    assert_eq!(
        (groq.calls.get(), s1.calls.get(), reads.get()),
        (0, 0, (0, 0))
    );
}

#[test]
fn the_status_names_what_the_choice_tries_first() {
    for (groq_key, s1_ready, groq_then_s1, s1_then_groq) in [
        (true, true, "groq", "s1Mini"),
        (true, false, "groq", "groq"),
        (false, true, "s1Mini", "s1Mini"),
        (false, false, "none", "none"),
    ] {
        assert_eq!(
            first_engine(Choice::DEFAULT, groq_key, s1_ready),
            groq_then_s1
        );
        assert_eq!(first_engine(S1_THEN_GROQ, groq_key, s1_ready), s1_then_groq);
        assert_eq!(
            first_engine(GROQ, groq_key, s1_ready),
            if groq_key { "groq" } else { "none" }
        );
        assert_eq!(
            first_engine(S1, groq_key, s1_ready),
            if s1_ready { "s1Mini" } else { "none" }
        );
        assert_eq!(first_engine(Choice::Off, groq_key, s1_ready), "off");
    }
}

#[test]
fn a_recording_warms_s1_only_when_it_will_answer() {
    let asked = Cell::new(0);
    let key = |has: bool| {
        let asked = &asked;
        move || {
            asked.set(asked.get() + 1);
            has
        }
    };
    assert!(warms_s1(S1, key(true)));
    assert!(warms_s1(S1_THEN_GROQ, key(true)));
    assert!(!warms_s1(GROQ, key(false)));
    assert!(!warms_s1(Choice::Off, key(false)));
    assert_eq!(asked.get(), 0, "only Groq with a fallback asks for the key");
    assert!(warms_s1(Choice::DEFAULT, key(false)));
    assert!(!warms_s1(Choice::DEFAULT, key(true)));
    assert_eq!(asked.get(), 2);
}

#[test]
fn choices_round_trip_through_their_stored_names() {
    for choice in [Choice::DEFAULT, GROQ, S1, S1_THEN_GROQ, Choice::Off] {
        assert_eq!(
            Choice::from_setting(Some(choice.name()), Some(choice.fallback())),
            choice
        );
    }
    assert_eq!(Choice::from_setting(None, None), Choice::DEFAULT);
    assert_eq!(Choice::from_setting(Some("S1-mini"), None), Choice::DEFAULT);
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
