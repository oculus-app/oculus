//! Studio -> Pronunciation's lexicon list (`studio::voice::review`): the
//! saved `lexicon.json` entries, adding, editing and removing one, a check
//! of a reading, and a sample of the word read with it before it is saved.
//! None of it makes a billed call: Kokoro synthesises on this computer.

use super::pronunciations::sample_word;
use crate::studio::tts::kokoro::{LexiconFiles, Packs};
use crate::studio::voice;
use crate::studio::voice::g2p::{guess, Dictionary};
use crate::studio::voice::review::{check, LexiconEntry, Store};

/// The global library's entries, then each subject's by code, each file's
/// in file order.
#[tauri::command]
pub async fn studio_lexicon_list() -> Result<Vec<LexiconEntry>, String> {
    crate::runtime::blocking::run(|| {
        let dict = Dictionary::load(&guess::dir())?;
        Store::app().lexicon(&dict)
    })
    .await
}

/// Sets `word` to `reading` in `subject`'s lexicon (the global one for
/// none), checked first; it applies at a video's next narrate.
#[tauri::command]
pub async fn studio_lexicon_set(
    subject: Option<String>,
    word: String,
    reading: String,
) -> Result<LexiconEntry, String> {
    crate::runtime::blocking::run(move || {
        let dict = Dictionary::load(&guess::dir())?;
        Store::app().set_entry(subject.as_deref(), &word, &reading, &dict)
    })
    .await
}

/// Removes `word` from `subject`'s lexicon.
#[tauri::command]
pub async fn studio_lexicon_remove(subject: Option<String>, word: String) -> Result<(), String> {
    crate::runtime::blocking::run(move || Store::app().remove_entry(subject.as_deref(), &word))
        .await
}

/// `word` alone read as `reading` over `subject`'s lexicon, in Settings ->
/// Studio -> Narration's Kokoro voice and speed, as WAV bytes.
#[tauri::command]
pub async fn studio_lexicon_sample(
    subject: Option<String>,
    word: String,
    reading: String,
) -> Result<tauri::ipc::Response, String> {
    crate::runtime::blocking::run(move || {
        if word.trim().is_empty() || reading.trim().is_empty() {
            return Err("give both the word and its reading".to_owned());
        }
        sample_word(
            word.trim(),
            reading.trim(),
            &voice::settings(),
            Packs::app(),
            LexiconFiles::app(subject.as_deref()),
        )
        .map(tauri::ipc::Response::new)
    })
    .await
}

/// The phonemes `reading` gives `word`, or why it gives none.
#[tauri::command]
pub async fn studio_lexicon_check(word: String, reading: String) -> Result<String, String> {
    crate::runtime::blocking::run(move || {
        let dict = Dictionary::load(&guess::dir())?;
        check("the reading", word.trim(), reading.trim(), &dict)
    })
    .await
}
