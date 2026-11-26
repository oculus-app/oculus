//! Which library path each Canvas file takes. Two files of a subject can share
//! a name, so the plain path is one id's and any other takes `name-<id>.ext`.
//! `file-paths.json` records the choice (`docs/sync.md`).

use std::collections::BTreeMap;
use std::sync::{Mutex, PoisonError};

use unicode_normalization::UnicodeNormalization;

use crate::library::layout::{self, SyncedKind};
use crate::library::paths;
use crate::sync::render::file_name;
use crate::sync::{Engine, Subject};

/// A sync and the video downloads beside it choose paths one at a time.
static CHOOSING: Mutex<()> = Mutex::new(());

/// A path as the disk compares it: macOS ignores case and Unicode form.
fn folded(rel: &str) -> String {
    rel.nfc().collect::<String>().to_lowercase()
}

/// `notes.pdf` → `notes-12.pdf`.
fn with_id(name: &str, id: i64) -> String {
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => format!("{stem}-{id}.{ext}"),
        _ => format!("{name}-{id}"),
    }
}

impl Engine {
    /// The subject-relative path Canvas file `id`, named `name`, is stored at:
    /// the same one on every run. `None` when the name makes no path.
    pub(in crate::sync) fn place_file(
        &self,
        c: &Subject,
        id: i64,
        kind: SyncedKind,
        name: &str,
    ) -> Result<Option<String>, String> {
        let plain = layout::synced(kind, name);
        let Some(plain_rel) = paths::course_rel_path(&c.code, &plain) else {
            return Ok(None);
        };
        let safe_name = plain_rel.rsplit('/').next().unwrap_or(&plain_rel);
        let other = layout::synced(kind, &with_id(safe_name, id));
        let Some(other_rel) = paths::course_rel_path(&c.code, &other) else {
            return Ok(None);
        };

        let _guard = CHOOSING.lock().unwrap_or_else(PoisonError::into_inner);
        let record = self.data_dir.join("file-paths.json");
        let mut owners: BTreeMap<String, i64> = std::fs::read_to_string(&record)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        let (plain_key, other_key) = (folded(&plain_rel), folded(&other_rel));
        if owners.get(&other_key) == Some(&id) {
            return Ok(Some(other));
        }
        if owners.get(&plain_key) == Some(&id) {
            return Ok(Some(plain));
        }

        let occupied = self.data_dir.join(&plain_rel).is_file();
        // Only this id is ever saved at its suffixed path.
        let take_plain = if self.data_dir.join(&other_rel).is_file() {
            false
        } else if let Some(&owner) = owners.get(&plain_key) {
            let gone = !self.still_named(c, owner, kind, &plain_key)?;
            // The departed owner's bytes are there, whatever the manifest says.
            if gone && occupied {
                self.forget_download(id);
            }
            gone
        } else if occupied {
            self.adopt(c, id, kind, &plain_rel)?
        } else {
            true
        };

        let (key, chosen) = if take_plain {
            (plain_key, plain)
        } else {
            (other_key, other)
        };
        owners.insert(key, id);
        crate::runtime::atomic_write::json(&record, &owners)?;
        Ok(Some(chosen))
    }

    /// Whether the file on disk at a path nobody is recorded for is to be
    /// `id`'s. The manifest's sizes say whose bytes it holds; where they
    /// cannot, `id` is forgotten so that it downloads again.
    fn adopt(&self, c: &Subject, id: i64, kind: SyncedKind, rel: &str) -> Result<bool, String> {
        let size = std::fs::metadata(self.data_dir.join(rel))
            .map_err(|e| e.to_string())?
            .len();
        let (mine, rivals) = {
            let manifest = self.manifest.borrow();
            let mine = manifest.get(&id.to_string()).map(|(_, s)| *s);
            let rivals: Vec<i64> = manifest
                .iter()
                .filter(|(_, (_, s))| *s == size)
                .filter_map(|(key, _)| key.parse().ok())
                .filter(|other| *other != id)
                .collect();
            (mine, rivals)
        };
        match mine {
            Some(s) if s == size => {
                if !rivals.is_empty() {
                    self.forget_download(id);
                }
                Ok(true)
            }
            // Downloaded once, and another id's size is what is there now.
            Some(_) if !rivals.is_empty() => Ok(false),
            Some(_) => {
                self.forget_download(id);
                Ok(true)
            }
            // A file new to this library replaces only one Canvas has dropped.
            None => {
                let key = folded(rel);
                for rival in rivals {
                    if self.still_named(c, rival, kind, &key)? {
                        return Ok(false);
                    }
                }
                Ok(true)
            }
        }
    }

    /// Whether Canvas still has file `id` under the name that makes the path
    /// `key`. A deleted or replaced file does not; one we may not read does.
    fn still_named(
        &self,
        c: &Subject,
        id: i64,
        kind: SyncedKind,
        key: &str,
    ) -> Result<bool, String> {
        let r = self.canvas.get(&format!("/api/v1/files/{id}"))?;
        match r.status {
            401 | 403 => return Ok(true),
            404 => return Ok(false),
            _ if !r.ok() => return Err(format!("Canvas answered HTTP {} for file {id}", r.status)),
            _ => {}
        }
        let info = r.json()?;
        if info["id"].as_i64().is_some_and(|answered| answered != id) {
            return Ok(false);
        }
        let inner = layout::synced(kind, &file_name(&info, None));
        Ok(paths::course_rel_path(&c.code, &inner).is_some_and(|rel| folded(&rel) == key))
    }
}
