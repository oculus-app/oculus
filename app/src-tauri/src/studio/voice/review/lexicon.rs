//! Checking a reading, reading a `lexicon.json`'s entries, and setting or
//! removing one of them. The app writes lexicon files in two places: the
//! review (accepting a suggestion or keeping the guess) and Studio ->
//! Pronunciation's lexicon list (adding, editing, removing, reverting).

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{Map, Value};

use crate::runtime::atomic_write;
use crate::studio::voice::g2p::{Dictionary, Lexicon};

/// Held across a lexicon's read-modify-write: two decisions on blocking
/// threads would otherwise each write the file without the other's entry.
static LOCK: Mutex<()> = Mutex::new(());

/// One key of a lexicon file, for Studio -> Pronunciation's lexicon list.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LexiconEntry {
    /// `None` is the global library's lexicon.
    pub subject: Option<String>,
    pub word: String,
    /// The value as stored: a respelling or `/phonemes/`.
    pub reading: String,
    /// What the reading resolves to, when it checks.
    pub phonemes: Option<String>,
    /// [`check`]'s sentence when it does not.
    pub error: Option<String>,
    /// A subject's entry whose word the global lexicon also has (in lower
    /// case), so this one wins for that subject.
    pub overrides: bool,
}

/// The phonemes `reading` gives `word`, or the lexicon's error for it
/// (a phoneme Kokoro lacks, a respelling part the dictionary lacks),
/// naming `source` as its file.
pub fn check(source: &str, word: &str, reading: &str, dict: &Dictionary) -> Result<String, String> {
    let entry = Value::Object(Map::from_iter([(
        word.to_owned(),
        Value::String(reading.to_owned()),
    )]))
    .to_string();
    let lexicon = Lexicon::from_json(&[(source, &entry)], dict).map_err(|e| e.to_string())?;
    lexicon
        .phonemes(word)
        .ok_or_else(|| format!("{source}: {word:?} cannot be a lexicon key"))
}

/// The words of the lexicon at `path` and their values as stored, in file
/// order, comments (`_` keys) left out. A missing file has none; a file
/// that is not a JSON object is refused.
pub fn entries(path: &Path) -> Result<Vec<(String, String)>, String> {
    Ok(load(path)?
        .into_iter()
        .filter(|(word, _)| !word.starts_with('_'))
        .map(|(word, value)| (word, text(&value)))
        .collect())
}

/// Set `word` to `reading` in the lexicon at `path`, checked first, and
/// return its value before. Every other key, comments (`_` keys) included,
/// keeps its value and place; a key already there keeps its place. A
/// missing file is created; a file that is not a JSON object is left alone
/// and refused. Setting the value a key already has writes nothing.
pub fn write_entry(
    path: &Path,
    word: &str,
    reading: &str,
    dict: &Dictionary,
) -> Result<Option<String>, String> {
    check(&path.display().to_string(), word, reading, dict)?;
    change(path, word, |_| Ok(()), Some(reading))
}

/// Remove `word` from the lexicon at `path`, every other key keeping its
/// place, and return its value. A word not there is refused.
pub fn remove_entry(path: &Path, word: &str) -> Result<String, String> {
    let missing = || format!("{word:?} is not in {}", path.display());
    let previous = change(path, word, |now| now.map(|_| ()).ok_or_else(missing), None)?;
    previous.ok_or_else(missing)
}

/// Put `word` back to `value` (`None` removes it), only while its value is
/// still `expect`: a revert must not undo a later edit.
pub fn restore_entry(
    path: &Path,
    word: &str,
    expect: Option<&str>,
    value: Option<&str>,
    dict: &Dictionary,
) -> Result<(), String> {
    if let Some(value) = value {
        check(&path.display().to_string(), word, value, dict)?;
    }
    let guard = |now: Option<&str>| match now == expect {
        true => Ok(()),
        false => Err(format!("{word} has changed since; edit it in the lexicon")),
    };
    change(path, word, guard, value).map(|_| ())
}

/// Under the lock: read `path`, let `allow` refuse on `word`'s current
/// value, then set it to `value` (`None` removes it), writing only when
/// that changes the file. Returns the value before.
fn change(
    path: &Path,
    word: &str,
    allow: impl FnOnce(Option<&str>) -> Result<(), String>,
    value: Option<&str>,
) -> Result<Option<String>, String> {
    let _held = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut map = load(path)?;
    let previous = map.get(word).map(text);
    allow(previous.as_deref())?;
    if previous.as_deref() == value {
        return Ok(previous);
    }
    match value {
        Some(value) => {
            map.insert(word.to_owned(), Value::String(value.to_owned()));
        }
        None => map = map.into_iter().filter(|(k, _)| k != word).collect(),
    }
    atomic_write::json(path, &Value::Object(map))?;
    Ok(previous)
}

/// The file's object, keys in file order; empty when it does not exist.
fn load(path: &Path) -> Result<Map<String, Value>, String> {
    let file = path.display();
    match std::fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(map)) => Ok(map),
            Ok(_) => Err(format!("{file}: not a JSON object; fix it by hand first")),
            Err(e) => Err(format!(
                "{file}: not a JSON object: {e}; fix it by hand first"
            )),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Map::new()),
        Err(e) => Err(format!("{file}: {e}")),
    }
}

/// A value as the lexicon list shows it: the string, else its JSON.
fn text(value: &Value) -> String {
    value
        .as_str()
        .map_or_else(|| value.to_string(), str::to_owned)
}
