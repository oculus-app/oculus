use super::*;

#[test]
fn sections_strip_emphasis_and_collapse_whitespace() {
    let s = Script::parse(
        "\n## intro\n\nWe follow the *gradient*\n  downhill, `one` __small__ step.\n\n## update-2\nThen   we stop.\n",
    )
    .unwrap();
    assert_eq!(s.sections.len(), 2);
    let intro = s.section("intro").unwrap();
    assert_eq!(
        intro.text,
        "We follow the gradient downhill, one small step."
    );
    assert_eq!(intro.line, 2);
    assert!(intro.raw.contains("*gradient*"));
    assert_eq!(s.section("update-2").unwrap().text, "Then we stop.");
    assert!(s.section("outro").is_none());
}

#[test]
fn deeper_headings_are_text() {
    let s = Script::parse("## a\n### not a heading\n").unwrap();
    assert_eq!(s.sections[0].text, "### not a heading");
}

#[test]
fn errors_name_their_line() {
    let e = Script::parse("Intro text\n## a\nhi\n").unwrap_err();
    assert!(e.starts_with("line 1: text before the first"), "{e}");
    let e = Script::parse("## a\nhi\n\n## a\nagain\n").unwrap_err();
    assert!(
        e.contains("line 4: `## a` repeats the section at line 1"),
        "{e}"
    );
    let e = Script::parse("## Intro Scene\nhi\n").unwrap_err();
    assert!(
        e.contains("line 1: `## Intro Scene` is not a scene id"),
        "{e}"
    );
    let e = Script::parse("## a\n\n## b\nhi\n").unwrap_err();
    assert!(e.contains("line 1: `## a` has no text"), "{e}");
    let e = Script::parse("## a\nhi\n## b\n**\n").unwrap_err();
    assert!(e.contains("line 3: `## b` has no text"), "{e}");
}

#[test]
fn pauses_are_cut_from_the_text_and_placed_by_word() {
    let s = Script::parse(
        "## a\n[pause 0.5] It *lands* on one.[pause]\nKeep\n[PAUSE  2] the rest. [pause]\n",
    )
    .unwrap();
    let a = &s.sections[0];
    assert_eq!(a.text, "It lands on one. Keep the rest.");
    let at: Vec<(usize, Option<f64>)> = a.pauses.iter().map(|p| (p.words, p.seconds)).collect();
    assert_eq!(at, [(0, Some(0.5)), (4, None), (5, Some(2.0)), (7, None)]);
    assert_eq!(
        a.clip_text(1.0),
        "[pause 0.5] It lands on one. [pause 1] Keep [pause 2] the rest. [pause 1]"
    );
    assert_eq!(a.pauses[1].length(0.75), 0.75);
    assert_eq!(a.pauses[2].length(0.75), 2.0);
}

#[test]
fn without_pauses_the_clip_text_is_the_text() {
    let s = Script::parse("## a\nOne *two*\nthree.\n").unwrap();
    let a = &s.sections[0];
    assert!(a.pauses.is_empty());
    assert_eq!(a.clip_text(1.0), a.text);
}

#[test]
fn a_malformed_pause_is_neither_said_nor_held() {
    let s = Script::parse("## a\nOne [pause x] two [pause 9] three [pause\n").unwrap();
    let a = &s.sections[0];
    assert_eq!(a.text, "One two three");
    assert!(a.pauses.is_empty());
    let e = Script::parse("## a\n[pause]\n").unwrap_err();
    assert!(e.contains("`## a` has no text"), "{e}");
}

#[test]
fn markers_read_their_seconds() {
    let read = |line: &str| -> Vec<Result<Option<f64>, String>> {
        markers(line).into_iter().map(|m| m.seconds).collect()
    };
    assert_eq!(
        read("a [pause] b [pause 1.5] [ pause .5 ]"),
        [Ok(None), Ok(Some(1.5)), Ok(Some(0.5))]
    );
    assert!(read("[note] and [1] are text").is_empty());
    let bad = |line: &str| read(line).remove(0).unwrap_err();
    assert!(bad("[pause x]").contains("is not a pause; write `[pause]`"));
    assert!(bad("[pause 1 2]").contains("is not a pause"));
    assert!(bad("[pause -1]").contains("is not a pause"));
    assert!(bad("[pauses]").contains("is not a pause"));
    assert!(bad("[pause 0]").contains("more than 0 and at most 5 seconds"));
    assert!(bad("[pause 5.5]").contains("more than 0 and at most 5 seconds"));
    assert!(bad("[pause 2").contains("no closing `]`"));
    let m = &markers("ab [pause 2] c")[0];
    assert_eq!((m.start, m.end), (3, 12));
}

#[test]
fn breaths_are_cut_from_the_text_and_placed_by_word() {
    let s = Script::parse(
        "## a\nFirst, [breath 0.2] we fix n. [breath] [pause]\nThen [BREATH .15] we stop.\n",
    )
    .unwrap();
    let a = &s.sections[0];
    assert_eq!(a.text, "First, we fix n. Then we stop.");
    let at: Vec<(usize, f64)> = a.breaths.iter().map(|b| (b.words, b.seconds)).collect();
    assert_eq!(at, [(1, 0.2), (4, DEFAULT_BREATH), (5, 0.15)]);
    assert_eq!(a.pauses.len(), 1, "a breath is not a pause");
    assert_eq!(
        a.clip_text(1.0),
        "First, [breath 0.2] we fix n. [pause 1] [breath 0.3] Then [breath 0.15] we stop."
    );
}

#[test]
fn a_malformed_breath_is_named() {
    let bad = |line: &str| markers(line).remove(0).seconds.unwrap_err();
    assert!(bad("[breath x]").contains("is not a breath; write `[breath]` for 0.3 seconds"));
    assert!(bad("[breathe]").contains("is not a breath"));
    assert!(bad("[breath 0]").contains("more than 0 and at most 1 second"));
    assert!(bad("[breath 1.5]").contains("a longer silence is a `[pause]`"));
    let s = Script::parse("## a\nOne [breath 2] two\n").unwrap();
    assert_eq!(s.sections[0].text, "One two");
    assert!(s.sections[0].breaths.is_empty());
}

#[test]
fn a_reading_keeps_its_word_in_the_text() {
    let s = Script::parse(
        "## a\nThe table [records](verb) each change, and \"[a](letter)\" is *[live](/lˈIv/)*.\nIt [reads](REEDS) on.\n",
    )
    .unwrap();
    let a = &s.sections[0];
    assert_eq!(
        a.text,
        "The table records each change, and \"a\" is live. It reads on."
    );
    let at: Vec<(usize, &str, &str)> = a
        .readings
        .iter()
        .map(|r| {
            let word = a.text.split_whitespace().nth(r.word).unwrap();
            (r.word, &word[r.start..r.end], r.reading.as_str())
        })
        .collect();
    assert_eq!(
        at,
        [
            (2, "records", "verb"),
            (6, "a", "letter"),
            (8, "live", "/lˈIv/"),
            (10, "reads", "REEDS")
        ]
    );
    assert_eq!(
        a.voiced(),
        "The table [records](verb) each change, and \"[a](letter)\" is [live](/lˈIv/). It [reads](REEDS) on."
    );
    assert_eq!(a.clip_text(1.0), a.voiced());
    assert_eq!(strip_readings(&a.voiced()), a.text);
}

#[test]
fn readings_sit_with_pauses_and_breaths() {
    let s = Script::parse("## a\nOne [breath] [record](noun), [pause 2] kept.\n").unwrap();
    let a = &s.sections[0];
    assert_eq!(a.text, "One record, kept.");
    assert_eq!(
        a.clip_text(1.0),
        "One [breath 0.3] [record](noun), [pause 2] kept."
    );
    assert_eq!((a.pauses.len(), a.breaths.len()), (1, 1));
    let plain = Script::parse("## a\nOne record, kept.\n").unwrap();
    assert_eq!(plain.sections[0].clip_text(1.0), "One record, kept.");
    assert_eq!(plain.sections[0].voiced(), "One record, kept.");
}

#[test]
fn a_malformed_reading_keeps_its_words_and_no_reading() {
    for (written, text) in [
        ("We [in use](noun) it.", "We in use it."),
        ("We re[cord](verb) it.", "We record it."),
        ("We [record](verb)s it.", "We records it."),
        ("We [record]() it.", "We record it."),
        ("We [record](two 2) it.", "We record it."),
        ("We [record](/ɹəkˈɔɹd) it.", "We record it."),
        ("We [record](verb", "We record"),
    ] {
        let s = Script::parse(&format!("## a\n{written}\n")).unwrap();
        assert_eq!(s.sections[0].text, text, "{written}");
        assert!(s.sections[0].readings.is_empty(), "{written}");
    }
    let s = Script::parse("## a\nA [pause](verb) and a [pause] here.\n").unwrap();
    assert_eq!(s.sections[0].text, "A pause and a here.");
    assert_eq!(s.sections[0].readings[0].reading, "verb");
    assert_eq!(s.sections[0].pauses.len(), 1);
}
