//! Studio -> Pronunciation's lexicon list: every saved entry, adding,
//! editing and removing one, and reverting a logged change. Each change is
//! logged in the history (`history`).

use std::collections::HashSet;

use super::history::{Event, Kind, Logged};
use super::lexicon::{self, LexiconEntry};
use super::{key, name, read_dir, Store};
use crate::studio::voice::g2p::Dictionary;

impl Store {
    /// Every lexicon entry: the global library's, then each subject's by
    /// code, each file's in file order.
    pub fn lexicon(&self, dict: &Dictionary) -> Result<Vec<LexiconEntry>, String> {
        let global = lexicon::entries(&self.lexicon_file(None))?;
        let shared: HashSet<String> = global.iter().map(|(w, _)| w.to_lowercase()).collect();
        let mut out: Vec<LexiconEntry> = global
            .into_iter()
            .map(|(word, reading)| self.entry(None, word, reading, false, dict))
            .collect();
        let mut codes: Vec<String> = read_dir(&self.subjects)?
            .iter()
            .filter(|dir| dir.join("lexicon.json").is_file())
            .filter_map(|dir| name(dir).map(str::to_owned))
            .collect();
        codes.sort();
        for code in codes {
            for (word, reading) in lexicon::entries(&self.lexicon_file(Some(&code)))? {
                let overrides = shared.contains(&word.to_lowercase());
                out.push(self.entry(Some(&code), word, reading, overrides, dict));
            }
        }
        Ok(out)
    }

    /// Sets `word` to `reading` in `subject`'s lexicon (the global one for
    /// none), logging `added` or `edited`; the value it already has is
    /// left alone and not logged.
    pub fn set_entry(
        &self,
        subject: Option<&str>,
        word: &str,
        reading: &str,
        dict: &Dictionary,
    ) -> Result<LexiconEntry, String> {
        let (word, reading) = (word.trim(), reading.trim());
        if word.is_empty() || reading.is_empty() {
            return Err("give both the word and its reading".into());
        }
        let path = self.subject_lexicon(subject)?;
        let previous = lexicon::write_entry(&path, word, reading, dict)?;
        if previous.as_deref() != Some(reading) {
            let kind = match previous {
                Some(_) => Kind::Edited,
                None => Kind::Added,
            };
            self.history().record(&Event {
                previous,
                reading: Some(reading.to_owned()),
                ..Event::new(kind, word, subject)
            });
        }
        let overrides = subject.is_some() && self.in_global(word)?;
        Ok(self.entry(subject, word.into(), reading.into(), overrides, dict))
    }

    /// Removes `word` from `subject`'s lexicon, logging `removed`.
    pub fn remove_entry(&self, subject: Option<&str>, word: &str) -> Result<(), String> {
        let path = self.subject_lexicon(subject)?;
        let previous = lexicon::remove_entry(&path, word)?;
        self.history().record(&Event {
            previous: Some(previous),
            ..Event::new(Kind::Removed, word, subject)
        });
        Ok(())
    }

    /// Puts the word of event `id` back to its value before, while it
    /// still has the value the event left, and logs `reverted`.
    pub fn revert(&self, id: &str, dict: &Dictionary) -> Result<Logged, String> {
        let history = self.history();
        let Logged { event, reverted } = history
            .read()?
            .into_iter()
            .find(|l| l.event.id == id)
            .ok_or_else(|| format!("no pronunciation history event {id:?}"))?;
        if !event.kind.revertable() {
            return Err(format!("{} cannot be reverted", event.word));
        }
        if reverted {
            return Err(format!("{} is already reverted", event.word));
        }
        let subject = event.subject.as_deref();
        let path = self.subject_lexicon(subject)?;
        lexicon::restore_entry(
            &path,
            &event.word,
            event.reading.as_deref(),
            event.previous.as_deref(),
            dict,
        )?;
        let undo = Event {
            previous: event.reading.clone(),
            reading: event.previous.clone(),
            reverts: Some(event.id.clone()),
            ..Event::new(Kind::Reverted, &event.word, subject)
        };
        history
            .append(&undo)
            .map_err(|e| format!("{} is put back, but the history was not: {e}", undo.word))?;
        Ok(Logged {
            event: undo,
            reverted: false,
        })
    }

    /// [`Store::lexicon_file`] for a subject code from the app, refusing one
    /// that cannot name a folder.
    fn subject_lexicon(&self, subject: Option<&str>) -> Result<std::path::PathBuf, String> {
        key::folder(subject)?;
        Ok(self.lexicon_file(subject))
    }

    /// Whether the global lexicon has `word`, in lower case.
    fn in_global(&self, word: &str) -> Result<bool, String> {
        let word = word.to_lowercase();
        Ok(lexicon::entries(&self.lexicon_file(None))?
            .iter()
            .any(|(w, _)| w.to_lowercase() == word))
    }

    fn entry(
        &self,
        subject: Option<&str>,
        word: String,
        reading: String,
        overrides: bool,
        dict: &Dictionary,
    ) -> LexiconEntry {
        let file = self.lexicon_file(subject).display().to_string();
        let (phonemes, error) = match lexicon::check(&file, &word, &reading, dict) {
            Ok(ps) => (Some(ps), None),
            Err(e) => (None, Some(e)),
        };
        LexiconEntry {
            subject: subject.map(str::to_owned),
            word,
            reading,
            phonemes,
            error,
            overrides,
        }
    }
}
