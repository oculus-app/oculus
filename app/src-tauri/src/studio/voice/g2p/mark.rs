//! A reading written into the text as misaki writes a link:
//! `[records](verb)` reads `records` as its verb. The reading is a part of
//! speech the word's dictionary entry has a reading for, `letter` or
//! `article` for `a`, or a lexicon value: a respelling in dictionary words
//! or `/phonemes/`. It reads that one word and nothing else; a reading the
//! word cannot take is an error naming the mark.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use regex::Regex;

use super::chars::lower;
use super::dict::{Dictionary, Entry};
use super::lexicon::respelt;
use super::Choice;

static LINK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\[([^\]]+)\]\(([^\)]*)\)").unwrap());

/// A part of speech a mark names, its Penn tag and the dictionary's key.
const KINDS: [(&str, &str, &str); 4] = [
    ("noun", "NN", "NOUN"),
    ("verb", "VB", "VERB"),
    ("adjective", "JJ", "ADJ"),
    ("adverb", "RB", "ADV"),
];

/// A reading and the byte range of its word in the text without marks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mark {
    pub start: usize,
    pub end: usize,
    pub reading: String,
}

/// What a mark makes of its word.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Forced {
    /// Read it by this tag.
    Tag(&'static str),
    Phonemes(String),
}

/// misaki's `preprocess`: leading whitespace dropped and each link read as
/// its text, with the link's reading kept as a mark. An empty reading
/// marks nothing.
pub fn preprocess(text: &str) -> (String, Vec<Mark>) {
    let text = text.trim_start();
    let mut out = String::with_capacity(text.len());
    let mut marks = Vec::new();
    let mut from = 0;
    for m in LINK.captures_iter(text) {
        let (all, word, reading) = (m.get(0).unwrap(), &m[1], m[2].trim());
        out.push_str(&text[from..all.start()]);
        let start = out.len();
        out.push_str(word);
        if !reading.is_empty() {
            marks.push(Mark {
                start,
                end: out.len(),
                reading: reading.to_owned(),
            });
        }
        from = all.end();
    }
    out.push_str(&text[from..]);
    (out, marks)
}

/// How `reading` reads `word`, or why it cannot.
pub fn force(dict: &Dictionary, word: &str, reading: &str) -> Result<Forced, String> {
    let written = format!("`[{word}]({reading})`");
    let kind = lower(reading);
    if let Some((kind, tag, _)) = KINDS.iter().find(|k| k.0 == kind) {
        if choices(dict, word).is_empty() {
            return Err(format!(
                "{written}: \"{word}\" has one reading in the dictionary, so there is no {kind} to pick; write a respelling in real words or /phonemes/"
            ));
        }
        return Ok(Forced::Tag(tag));
    }
    if matches!(kind.as_str(), "letter" | "article") {
        if lower(word) != "a" {
            return Err(format!(
                "{written}: `letter` and `article` are the readings of \"a\"; write a respelling in real words or /phonemes/"
            ));
        }
        return Ok(Forced::Tag(if kind == "letter" { "NNP" } else { "DT" }));
    }
    respelt(dict, reading)
        .map(Forced::Phonemes)
        .map_err(|e| format!("{written}: {e}"))
}

/// `word`'s dictionary readings when it has more than one, each with the
/// mark that picks it: a part of speech when only parts of speech key the
/// reading, else its phonemes in slashes. In phoneme order.
pub fn choices(dict: &Dictionary, word: &str) -> Vec<Choice> {
    let Some(Entry::Tags(tags)) = dict.gold(&lower(word)) else {
        return Vec::new();
    };
    let mut keyed: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
    for (tag, ps) in tags {
        if let Some(ps) = ps.as_deref().filter(|_| tag != "None") {
            keyed.entry(ps).or_default().push(tag);
        }
    }
    if keyed.len() < 2 {
        return Vec::new();
    }
    let choice = |(ps, tags): (&str, Vec<&str>)| {
        let kind = KINDS
            .iter()
            .find(|k| tags.contains(&k.2))
            .filter(|_| tags.iter().all(|t| KINDS.iter().any(|k| k.2 == *t)));
        let phonemes = ps.replace('ɾ', "T").replace('ʔ', "t");
        Choice {
            mark: kind.map_or_else(|| format!("/{phonemes}/"), |k| k.0.to_owned()),
            phonemes,
        }
    };
    keyed.into_iter().map(choice).collect()
}
