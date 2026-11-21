//! English (US) text to Kokoro phonemes, without spaCy or espeak: a port of
//! misaki 0.9.4's dictionary path (`misaki/en.py`) as the oracle in
//! `data/evals/studio-g2p/tools/a2c.py` runs it. Each word is read by the
//! reading marked on it in the text (`[records](verb)`, `mark.rs`), else the
//! user's lexicon, else misaki's gold and silver dictionaries with its
//! special cases, case handling and stem rules (plus `-ied` and British
//! `-ise`) and a heteronym's reading picked by a neighbour-word table, else
//! the guesser, one sub-token at a time. Nothing is dropped:
//! a word with a letter in it and no phonemes is an error naming it.
//!
//! The golden files under `tests/golden/` are the oracle's output; the
//! port matches them byte for byte.

mod chars;
mod dict;
pub mod guess;
mod heteronym;
mod lexicon;
mod mark;
mod resolve;
mod special;
mod split;
mod stem;
mod stress;
mod tag;
#[cfg(test)]
mod tests;
mod token;
mod word;

pub use dict::{Dictionary, Entry};
pub use lexicon::{Lexicon, LexiconError};
pub use resolve::phonemize;

/// Phonemes for a word or sub-token nothing else reads.
pub trait Guess {
    fn guess(&mut self, part: &str) -> Result<String, String>;
}

/// Who read a word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Dict,
    /// The heteronym table picked the reading.
    Rule,
    Lexicon,
    Guess,
    /// A reading marked on the word in the text.
    Marked,
}

impl Source {
    pub fn as_str(self) -> &'static str {
        match self {
            Source::Dict => "dict",
            Source::Rule => "rule",
            Source::Lexicon => "lexicon",
            Source::Guess => "guess",
            Source::Marked => "marked",
        }
    }
}

/// One whitespace word (punctuation split off) and how it reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WordRecord {
    pub word: String,
    pub phonemes: String,
    pub source: Source,
    /// The parts the guesser answered, right to left; empty unless `source`
    /// is `Guess`.
    pub guessed: Vec<String>,
    /// For an unmarked word the dictionary has more than one reading for:
    /// the one it was read with, then the others. Else empty.
    pub readings: Vec<Choice>,
}

/// One of a word's dictionary readings and the mark that picks it
/// (`verb`, or `/phonemes/`).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct Choice {
    pub mark: String,
    pub phonemes: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Phonemized {
    /// What Kokoro is given: the words' phonemes with the text's
    /// punctuation and whitespace (leading whitespace dropped).
    pub phonemes: String,
    pub words: Vec<WordRecord>,
}
