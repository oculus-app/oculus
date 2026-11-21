use super::super::{phonemize, Choice, Guess, Lexicon, Phonemized, Source};
use super::fixtures::trimmed_dictionary;

struct Never;

impl Guess for Never {
    fn guess(&mut self, part: &str) -> Result<String, String> {
        Err(format!("cannot guess {part}"))
    }
}

fn read(text: &str) -> Result<Phonemized, String> {
    phonemize(text, &trimmed_dictionary(), &Lexicon::default(), &mut Never)
}

/// The word `text`'s `n`th record is for, its phonemes and who read it.
fn word(text: &str, n: usize) -> (String, String, Source) {
    let w = read(text).unwrap().words.swap_remove(n);
    (w.word, w.phonemes, w.source)
}

#[test]
fn a_part_of_speech_picks_the_words_own_reading() {
    let plain = read("It is in use.").unwrap();
    assert_eq!(plain.words[3].phonemes, "jˈuz");
    let choice = |mark: &str, phonemes: &str| Choice {
        mark: mark.into(),
        phonemes: phonemes.into(),
    };
    assert_eq!(
        plain.words[3].readings,
        [choice("/jˈuz/", "jˈuz"), choice("noun", "jˈus")]
    );
    let marked = read("It is in [use](noun).").unwrap();
    assert_eq!(marked.phonemes, plain.phonemes.replace("jˈuz", "jˈus"));
    let w = &marked.words[3];
    assert_eq!((w.word.as_str(), w.source), ("use", Source::Marked));
    assert!(w.readings.is_empty());

    assert_eq!(word("the record", 1).1, "ɹˈɛkəɹd");
    assert_eq!(word("the [record](verb)", 1).1, "ɹəkˈɔɹd");
    assert_eq!(word("the \"[Record](VERB)\",", 1).1, "ɹəkˈɔɹd");
    assert_eq!(word("we [record](noun) it", 1).1, "ɹˈɛkəɹd");
    assert_eq!(word("we [live](adjective)", 1).1, "lˈIv");
    assert_eq!(word("a [minute](adjective) table", 1).1, "mInˈut");
}

#[test]
fn a_is_the_letter_or_the_article_as_marked() {
    assert_eq!(word("is a table", 1).1, "ɐ");
    assert_eq!(word("is [a](letter) table", 1).1, "ˈA");
    assert_eq!(word("is A table", 1).1, "ˈA");
    assert_eq!(word("is [A](article) table", 1).1, "ɐ");
    assert_eq!(word("[A](letter) is a table", 0).1, "ˈA");
}

#[test]
fn a_capital_a_opening_any_sentence_is_the_article() {
    let p = read("It is a table. A table is a table! \"A table?\" (A table is A.)").unwrap();
    let a: Vec<&str> = p
        .words
        .iter()
        .filter(|w| w.word.eq_ignore_ascii_case("a"))
        .map(|w| w.phonemes.as_str())
        .collect();
    assert_eq!(a, ["ɐ", "ɐ", "ɐ", "ɐ", "ɐ", "ˈA"]);
}

#[test]
fn a_respelling_or_phonemes_read_the_word_outright() {
    assert_eq!(
        word("the [table](SOFT-max) is", 1),
        ("table".into(), "sˈɔftmˌæks".into(), Source::Marked)
    );
    assert_eq!(word("the [table](/tˈAbəl/).", 1).1, "tˈAbəl");
    assert_eq!(word("the [zzqx](/zˈIks/) table", 1).1, "zˈIks");
    assert_eq!(
        read("the [table]() is").unwrap(),
        read("the table is").unwrap()
    );
}

#[test]
fn a_reading_the_word_cannot_take_is_an_error_naming_the_mark() {
    for (text, why) in [
        ("the [table](verb)", "has one reading in the dictionary"),
        ("the [table](letter)", "the readings of \"a\""),
        (
            "the [table](ZZYZX-blap)",
            "\"ZZYZX\" is not in the dictionary",
        ),
        ("the [table](/t☃/)", "not in Kokoro's vocabulary"),
        ("the [soft table](noun)", "wraps one whole word"),
        ("the re[cord](verb)", "wraps one whole word"),
        ("the [record,](verb)", "wraps one whole word"),
    ] {
        let e = read(text).unwrap_err();
        assert!(e.contains(why), "{text}: {e}");
        assert!(e.starts_with("`["), "{text}: {e}");
    }
}
