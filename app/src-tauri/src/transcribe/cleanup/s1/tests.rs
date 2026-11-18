use std::cell::RefCell;

use serde_json::{json, Value};

use super::text::{self, chunks, estimate_tokens, join, max_tokens, CHUNK_TOKENS, CONTROL_LINE};
use super::{Complete, S1};
use crate::transcribe::cleanup::Clean;

/// A server that answers each request with the next of `answers` and keeps
/// what it was sent.
struct Fake {
    answers: RefCell<Vec<Value>>,
    sent: RefCell<Vec<Value>>,
}

impl Fake {
    fn new(answers: Vec<Value>) -> Self {
        Self {
            answers: RefCell::new(answers),
            sent: RefCell::new(Vec::new()),
        }
    }
}

impl Complete for &Fake {
    fn complete(&self, body: &Value) -> Result<Value, String> {
        self.sent.borrow_mut().push(body.clone());
        Ok(self.answers.borrow_mut().remove(0))
    }
}

fn answer(content: &str) -> Value {
    json!({"choices": [{"message": {"role": "assistant", "content": content}, "finish_reason": "stop"}]})
}

fn s1<'a>(fake: &'a Fake, language: &str) -> S1<&'a Fake> {
    S1 {
        completer: fake,
        language: language.into(),
    }
}

#[test]
fn the_request_is_the_trained_format_word_for_word() {
    let body = text::request("so um i need to send the report");
    assert_eq!(
        CONTROL_LINE,
        "[Styling: semi-formal] [Structure: lists] [Context: general]"
    );
    assert_eq!(body["temperature"], 0);
    let messages = body["messages"].as_array().unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(
        messages[0],
        json!({"role": "system", "content": "You are a text normalizer for speech-to-text transcripts. The input begins with a control line specifying the styling, structure, and context settings; clean the transcript to match those settings and output only the cleaned text."})
    );
    assert_eq!(
        messages[1]["content"],
        "[Styling: semi-formal] [Structure: lists] [Context: general]\nso um i need to send the report"
    );
    assert_eq!(
        body["max_tokens"],
        max_tokens("so um i need to send the report")
    );
}

#[test]
fn output_is_capped_at_1_3_times_the_input_and_a_margin() {
    assert_eq!(estimate_tokens(""), 0);
    assert_eq!(estimate_tokens("abcd"), 1);
    assert_eq!(estimate_tokens("abcde"), 2);
    assert_eq!(max_tokens(""), 32);
    let words = "word ".repeat(200);
    let input = estimate_tokens(&words);
    assert_eq!(input, 250);
    assert_eq!(max_tokens(&words), 325 + 32);
}

#[test]
fn a_short_transcript_is_one_piece() {
    assert_eq!(
        chunks("hello there. how are you", CHUNK_TOKENS),
        vec!["hello there. how are you"]
    );
}

#[test]
fn a_long_transcript_is_cut_at_sentences_under_the_limit() {
    let sentence = "This sentence is exactly forty eight characters.";
    let transcript = [sentence; 10].join(" ");
    let pieces = chunks(&transcript, 30);
    assert!(pieces.len() > 1);
    for piece in &pieces {
        assert!(estimate_tokens(piece) <= 30, "{piece}");
        assert!(piece.ends_with('.'), "cut mid-sentence: {piece}");
    }
    assert_eq!(pieces.join(" "), transcript);
}

#[test]
fn question_marks_line_breaks_and_decimals() {
    let pieces = chunks("is it 3.5 or 4? yes\nok then!", 4);
    assert_eq!(pieces, vec!["is it 3.5 or 4?", "yes ok then!"]);
}

#[test]
fn a_sentence_over_the_limit_is_cut_between_words() {
    let run_on = "and then ".repeat(50);
    let pieces = chunks(run_on.trim(), 20);
    assert!(pieces.len() > 1);
    for piece in &pieces {
        assert!(estimate_tokens(piece) <= 20, "{piece}");
        assert!(!piece.starts_with(' ') && !piece.ends_with(' '));
    }
    assert_eq!(pieces.join(" "), run_on.trim());
}

#[test]
fn pieces_join_as_prose_and_lists_stand_apart() {
    let parts = |p: &[&str]| p.iter().map(|s| s.to_string()).collect::<Vec<_>>();
    assert_eq!(join(&parts(&["One.", "Two."])), "One. Two.");
    assert_eq!(join(&parts(&["One.", "", "Two."])), "One. Two.");
    assert_eq!(
        join(&parts(&["Pack:\n- A\n- B\n- C", "Then go."])),
        "Pack:\n- A\n- B\n- C\n\nThen go."
    );
    assert_eq!(join(&parts(&["", " "])), "");
}

#[test]
fn only_english_runs() {
    assert!(text::english("so um what is x squared", "en"));
    assert!(text::english("café naïve Ærøskøbing µs", "auto"));
    assert!(!text::english("uh ช่วย explain eigenvectors หน่อย", "en"));
    assert!(!text::english("这个 eigenvalue 是什么", "auto"));
    assert!(!text::english("plain english words", "th"));
    assert!(!text::english("plain english words", "zh"));
}

#[test]
fn foreign_speech_is_returned_as_heard_without_running_the_model() {
    let fake = Fake::new(vec![]);
    let thai = "uh ช่วย explain eigenvectors หน่อย";
    assert_eq!(s1(&fake, "en").clean(thai).unwrap(), thai);
    assert_eq!(s1(&fake, "th").clean("hello").unwrap(), "hello");
    assert!(fake.sent.borrow().is_empty());
}

#[test]
fn each_piece_is_its_own_request_and_the_outputs_join() {
    let sentence = "so um this is one sentence that goes on for a while.";
    let transcript = [sentence; 120].join(" ");
    let expected = chunks(&transcript, CHUNK_TOKENS).len();
    assert!(expected > 1);
    let fake = Fake::new(
        (0..expected)
            .map(|i| answer(&format!("Part {i}.")))
            .collect(),
    );
    let cleaned = s1(&fake, "en").clean(&transcript).unwrap();
    assert_eq!(fake.sent.borrow().len(), expected);
    assert!(cleaned.starts_with("Part 0. Part 1."));
    for body in fake.sent.borrow().iter() {
        let user = body["messages"][1]["content"].as_str().unwrap();
        assert!(user.starts_with(&format!("{CONTROL_LINE}\n")));
        let piece = &user[CONTROL_LINE.len() + 1..];
        assert_eq!(body["max_tokens"], max_tokens(piece));
    }
}

#[test]
fn filler_only_speech_cleans_to_nothing() {
    let fake = Fake::new(vec![answer("")]);
    assert_eq!(s1(&fake, "en").clean("um uh").unwrap(), "");
}

#[test]
fn output_that_hits_its_cap_is_a_failure() {
    let fake = Fake::new(vec![
        json!({"choices": [{"message": {"content": "so so so"}, "finish_reason": "length"}]}),
    ]);
    assert!(s1(&fake, "en").clean("so").unwrap_err().contains("cap"));
}

#[test]
fn a_stray_is_an_adopted_process_carrying_our_alias() {
    let listing = "\
  4011     1   501 /Applications/Oculus.app/Contents/MacOS/llama-server -m /x/s1-mini-q4_k_m.gguf --port 5 --alias oculus-s1-mini
  4012 54983   501 /Applications/Oculus.app/Contents/MacOS/llama-server -m /x/s1-mini-q4_k_m.gguf --port 6 --alias oculus-s1-mini
  4013     1   501 /bin/sh -c exec 3<&0 /Users/some one/llama-server-aarch64-apple-darwin -m /x --alias oculus-s1-mini
  4014     1   501 /opt/homebrew/bin/llama-server -m /x/other.gguf --port 8080
  4015     1     0 /Applications/Oculus.app/Contents/MacOS/llama-server --alias oculus-s1-mini
";
    assert_eq!(super::strays::strays(listing, 501), vec![4011, 4013]);
}

/// The real sidecar against a real model: `S1_MINI_GGUF=/path/to/s1-mini-q4_k_m.gguf
/// cargo test --lib transcribe::cleanup::s1::tests::live_s1_mini -- --ignored --exact`.
/// Needs `bun run llama` and a localhost port.
#[test]
#[ignore]
fn live_s1_mini() {
    let model = std::path::PathBuf::from(
        std::env::var("S1_MINI_GGUF").expect("set S1_MINI_GGUF to the GGUF's path"),
    );
    let helper = super::helper(None).expect("run `bun run llama` in app/");
    let dir = crate::test_support::Scratch::new("s1-live");
    let launch = super::server::Launch {
        helper,
        model,
        log: dir.join("llama-server.log"),
    };
    let s1 = S1 {
        completer: launch.clone(),
        language: "en".into(),
    };

    let started = std::time::Instant::now();
    super::server::warm(&launch).unwrap();
    let warm = started.elapsed();
    assert!(super::server::running());

    let cases = [
        "so um i need to like send the the report by uh friday no wait make that thursday",
        "so for the trip we need to pack sunscreen and then also a first aid kit and um chargers for everything",
        "um uh",
    ];
    for case in cases {
        let started = std::time::Instant::now();
        let cleaned = s1.clean(case).unwrap();
        println!(
            "{:>5} ms  {case:?}\n          -> {cleaned:?}",
            started.elapsed().as_millis()
        );
    }
    let corrected = s1.clean(cases[0]).unwrap();
    assert!(
        corrected.contains("Thursday") && !corrected.contains("Friday"),
        "{corrected}"
    );

    // The token estimate against the server's own count.
    let counted = super::server::complete(
        &launch,
        &json!({"messages": [{"role": "user", "content": cases[1]}], "max_tokens": 1, "temperature": 0}),
    )
    .unwrap();
    println!(
        "estimate {} tokens; Qwen counted {} for the same text in its chat frame",
        estimate_tokens(cases[1]),
        counted["usage"]["prompt_tokens"]
    );

    super::server::stop();
    assert!(!super::server::running());
    println!("server load {} ms", warm.as_millis());
}
