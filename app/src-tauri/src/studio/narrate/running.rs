//! App narrations in flight, keyed by canonical video folder.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

pub static NARRATIONS: Narrations = Narrations {
    running: Mutex::new(BTreeMap::new()),
};

pub struct Narrations {
    running: Mutex<BTreeMap<PathBuf, Arc<AtomicBool>>>,
}

pub const BUSY: &str = "this video is being narrated; wait for it or cancel it";

impl Narrations {
    pub fn start(&self, dir: &Path) -> Result<Running<'_>, String> {
        let key = dir
            .canonicalize()
            .map_err(|e| format!("{}: {e}", dir.display()))?;
        let mut running = self.lock();
        if running.contains_key(&key) {
            return Err(BUSY.to_owned());
        }
        let cancel = Arc::new(AtomicBool::new(false));
        running.insert(key.clone(), cancel.clone());
        Ok(Running {
            narrations: self,
            key,
            cancel,
        })
    }

    pub fn cancel(&self, dir: &Path) -> bool {
        let Ok(key) = dir.canonicalize() else {
            return false;
        };
        self.lock().get(&key).is_some_and(|cancel| {
            cancel.store(true, Ordering::Relaxed);
            true
        })
    }

    pub fn running(&self, dir: &Path) -> bool {
        dir.canonicalize()
            .is_ok_and(|key| self.lock().contains_key(&key))
    }

    fn lock(&self) -> MutexGuard<'_, BTreeMap<PathBuf, Arc<AtomicBool>>> {
        self.running.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Frees the folder on drop.
pub struct Running<'a> {
    narrations: &'a Narrations,
    key: PathBuf,
    cancel: Arc<AtomicBool>,
}

impl Running<'_> {
    pub fn cancel_flag(&self) -> &AtomicBool {
        &self.cancel
    }
}

impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.narrations.lock().remove(&self.key);
    }
}
