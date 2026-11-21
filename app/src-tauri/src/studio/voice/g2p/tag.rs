//! Tokens and tags without spaCy, as the oracle tags them: whitespace
//! chunks with punctuation peeled off each end and dashes split out; the
//! punctuation gets its Penn tag, `I` is `PRP`, a/an/the `DT`, to `TO`, in
//! `IN`, and an `a` that is the letter rather than the article (a capital
//! `A` that does not open a sentence, or an `a` with no word after it) is
//! `NNP`. A word with more than one dictionary reading, and `lead`, then
//! takes the heteronym table's tag (or phonemes) instead, and a word with
//! a reading marked on it (`mark.rs`) takes that over all of these. Every
//! other word is untagged.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

use super::chars::lower;
use super::dict::{Dictionary, Entry};
use super::heteronym::{decide, Decision, SKIP_ADV};
use super::mark::{force, Forced, Mark};
use super::token::Token;

static CHUNK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\S+)(\s*)").unwrap());

const LEAD: &[char] = &['"', '“', '('];
const TRAIL: &[char] = &['.', ',', ';', ':', '!', '?', '"', '”', ')', '…'];
const DASHES: &[char] = &['—', '–'];

pub struct Tagged {
    pub tokens: Vec<Token>,
    /// Words whose reading a heteronym rule chose, by text.
    pub rules: HashSet<String>,
}

fn punct_tag(c: char, lead: bool) -> &'static str {
    match c {
        '"' if lead => "``",
        '"' => "''",
        '.' | '!' | '?' => ".",
        ',' => ",",
        ';' | ':' | '—' | '–' | '…' => ":",
        '(' => "-LRB-",
        ')' => "-RRB-",
        '“' => "``",
        '”' => "''",
        _ => "",
    }
}

/// A whitespace chunk as `(text, punctuation tag)` pieces; words have no tag.
fn split_chunk(chunk: &str) -> Vec<(String, Option<&'static str>)> {
    let cs: Vec<char> = chunk.chars().collect();
    let (mut start, mut end) = (0, cs.len());
    while start < end && LEAD.contains(&cs[start]) {
        start += 1;
    }
    while end > start && TRAIL.contains(&cs[end - 1]) {
        end -= 1;
    }
    let mut out: Vec<(String, Option<&'static str>)> = cs[..start]
        .iter()
        .map(|&c| (c.to_string(), Some(punct_tag(c, true))))
        .collect();
    let mut word = String::new();
    for &c in &cs[start..end] {
        if DASHES.contains(&c) {
            if !word.is_empty() {
                out.push((std::mem::take(&mut word), None));
            }
            out.push((c.to_string(), Some(punct_tag(c, false))));
        } else {
            word.push(c);
        }
    }
    if !word.is_empty() {
        out.push((word, None));
    }
    out.extend(
        cs[end..]
            .iter()
            .map(|&c| (c.to_string(), Some(punct_tag(c, false)))),
    );
    out
}

/// `text`'s tokens, tagged; `marks` are the readings marked on its words
/// (`mark::preprocess`). A mark that is not on one whole word, or that its
/// word cannot take, is an error.
pub fn tokenize(text: &str, dict: &Dictionary, marks: &[Mark]) -> Result<Tagged, String> {
    let mut pieces: Vec<(String, Option<&'static str>, String)> = Vec::new();
    let mut starts: Vec<usize> = Vec::new();
    for m in CHUNK.captures_iter(text) {
        let ws = &m[2];
        let mut at = m.get(1).map_or(0, |chunk| chunk.start());
        let parts = split_chunk(&m[1]);
        let n = parts.len();
        for (j, (t, tag)) in parts.into_iter().enumerate() {
            let ws = if j + 1 == n { ws } else { "" };
            starts.push(at);
            at += t.len();
            pieces.push((t, tag, ws.to_string()));
        }
    }
    let mut forced: HashMap<usize, Forced> = HashMap::new();
    for mark in marks {
        let word = &text[mark.start..mark.end];
        let piece = (0..pieces.len()).find(|&k| {
            starts[k] == mark.start && pieces[k].0.len() == word.len() && pieces[k].1.is_none()
        });
        let Some(k) = piece else {
            return Err(format!(
                "`[{word}]({})`: a reading wraps one whole word, its punctuation outside",
                mark.reading
            ));
        };
        forced.insert(k, force(dict, word, &mark.reading)?);
    }
    let is_word = |k: usize| pieces.get(k).is_some_and(|p| p.1.is_none());
    let words: Vec<usize> = (0..pieces.len()).filter(|&k| is_word(k)).collect();
    let sent: Vec<String> = words.iter().map(|&k| lower(&pieces[k].0)).collect();
    let mut rules = HashSet::new();
    let mut tokens = Vec::with_capacity(pieces.len());
    for (k, (t, punct, ws)) in pieces.iter().enumerate() {
        let mut token = Token::new(t, punct.unwrap_or(""), ws);
        if punct.is_none() {
            let wi = words.iter().position(|&w| w == k).unwrap_or(0);
            let lw = lower(t);
            let mut tag = if t == "I" {
                "PRP"
            } else {
                match lw.as_str() {
                    "a" | "an" | "the" => "DT",
                    "to" => "TO",
                    "in" => "IN",
                    _ => "",
                }
            };
            if lw == "a" && (!is_word(k + 1) || (t == "A" && !opens_sentence(&pieces, k))) {
                tag = "NNP";
            }
            let entry = dict.gold(&lw);
            if let Some(reading) = forced.remove(&k) {
                token.marked = true;
                match reading {
                    Forced::Tag(t) => tag = t,
                    Forced::Phonemes(ps) => token.phonemes = Some(ps),
                }
            } else if matches!(entry, Some(Entry::Tags(_))) || lw == "lead" {
                let (l1, l2, r1) = neighbours(&pieces, &words, k, wi);
                let has_adj = matches!(entry, Some(Entry::Tags(t)) if t.contains_key("ADJ"));
                match decide(&lw, &l1, &l2, &r1, &sent, has_adj) {
                    Some(Decision::Tag(d)) => {
                        tag = d;
                        rules.insert(t.clone());
                    }
                    Some(Decision::Phonemes(ps)) => {
                        token.phonemes = Some(ps.to_string());
                        rules.insert(t.clone());
                    }
                    None => {}
                }
            }
            token.tag = tag.to_string();
        }
        tokens.push(token);
    }
    Ok(Tagged { tokens, rules })
}

/// Whether piece `k` is the first word of the text or of a sentence in
/// it: nothing but quotes and brackets lie between it and the start or a
/// `.`, `!` or `?`.
fn opens_sentence(pieces: &[(String, Option<&'static str>, String)], k: usize) -> bool {
    let mut j = k;
    while j > 0 && matches!(pieces[j - 1].1, Some("``" | "''" | "-LRB-" | "-RRB-")) {
        j -= 1;
    }
    j == 0 || pieces[j - 1].1 == Some(".")
}

/// The two words left of word `k` (the `wi`th word) and the one right of
/// it, lower case; `""` past punctuation or the unit's edge. One run of
/// adverbs right before the word is skipped ("has not read").
fn neighbours(
    pieces: &[(String, Option<&'static str>, String)],
    words: &[usize],
    k: usize,
    wi: usize,
) -> (String, String, String) {
    let mut left: Vec<String> = Vec::new();
    let mut j = wi;
    while j > 0 && words[j - 1] + (wi - j + 1) == k && left.len() < 2 {
        let w = lower(&pieces[words[j - 1]].0);
        if !(left.is_empty() && SKIP_ADV.contains(&w.as_str())) {
            left.push(w);
        }
        j -= 1;
    }
    let right = match pieces.get(k + 1) {
        Some((t, None, _)) => lower(t),
        _ => String::new(),
    };
    let mut left = left.into_iter();
    let l1 = left.next().unwrap_or_default();
    let l2 = left.next().unwrap_or_default();
    (l1, l2, right)
}
