//! The renders in flight, at most one per video folder, since two would
//! write the same segments, cache index and output. Each is keyed by its
//! canonical folder and holds the cancel flag its render checks; `Running`
//! removes it when dropped, on every way a render ends.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use super::preset::Preset;

/// The app's renders.
pub static RENDERS: Renders = Renders::new();

pub struct Renders {
    running: Mutex<BTreeMap<PathBuf, Entry>>,
}

struct Entry {
    preset: Preset,
    cancel: Arc<AtomicBool>,
}

impl Renders {
    pub const fn new() -> Self {
        Self {
            running: Mutex::new(BTreeMap::new()),
        }
    }

    /// Claim `dir` for a render, or refuse naming the render that holds it.
    pub fn start(&self, dir: &Path, preset: Preset) -> Result<Running<'_>, String> {
        let mut running = self.lock();
        let key = std::fs::canonicalize(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        if let Some(entry) = running.get(&key) {
            return Err(format!(
                "a {} render of {} is already running; wait for it or cancel it",
                entry.preset.name(),
                key.display()
            ));
        }
        let cancel = Arc::new(AtomicBool::new(false));
        running.insert(
            key.clone(),
            Entry {
                preset,
                cancel: cancel.clone(),
            },
        );
        Ok(Running {
            renders: self,
            key,
            cancel,
        })
    }

    /// Ask the render of `dir` to stop; false when none runs.
    pub fn cancel(&self, dir: &Path) -> bool {
        let Ok(key) = std::fs::canonicalize(dir) else {
            return false;
        };
        match self.lock().get(&key) {
            Some(entry) => {
                entry.cancel.store(true, Ordering::Relaxed);
                true
            }
            None => false,
        }
    }

    /// The preset of the render that holds `dir`, if one runs.
    pub fn running(&self, dir: &Path) -> Option<Preset> {
        let key = std::fs::canonicalize(dir).ok()?;
        self.lock().get(&key).map(|entry| entry.preset)
    }

    /// Hold off new renders while a deletion changes the folder or its cache.
    pub(in crate::studio) fn while_idle(
        &self,
        dir: &Path,
        delete: impl FnOnce(&Path) -> Result<(), String>,
    ) -> Result<(), String> {
        let running = self.lock();
        let key = std::fs::canonicalize(dir)
            .map_err(|e| format!("Could not open the video folder {}: {e}", dir.display()))?;
        if let Some(entry) = running.get(&key) {
            return Err(format!(
                "A {} render of this video is running. Cancel it first.",
                entry.preset.name()
            ));
        }
        delete(&key)
    }

    /// A render that panicked while holding the lock left the map whole.
    fn lock(&self) -> MutexGuard<'_, BTreeMap<PathBuf, Entry>> {
        self.running.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Default for Renders {
    fn default() -> Self {
        Self::new()
    }
}

/// A claimed folder; dropping it frees the folder.
pub struct Running<'a> {
    renders: &'a Renders,
    key: PathBuf,
    cancel: Arc<AtomicBool>,
}

impl Running<'_> {
    /// The flag `render` checks, set by `Renders::cancel`.
    pub fn cancel_flag(&self) -> &AtomicBool {
        &self.cancel
    }
}

impl Drop for Running<'_> {
    fn drop(&mut self) {
        let mut running = self.renders.lock();
        if running
            .get(&self.key)
            .is_some_and(|entry| Arc::ptr_eq(&entry.cancel, &self.cancel))
        {
            running.remove(&self.key);
        }
    }
}
