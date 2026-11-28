//! The app's own folder, `<data dir>/.oculus/`: the database, the agents'
//! workspace, Studio, models, keyd's vault and everything else that is not
//! the student's. The rest of the data dir's top level is the library
//! (docs/architecture.md, "The data directory"). The name and the folder are
//! `keyd_core`'s, so `oculus-keyd` agrees.

use std::path::{Path, PathBuf};

pub use keyd_core::paths::{ensure_state_dir, state_dir, STATE_DIR};

/// `.oculus/<name>`: a state path as rows, rules and the frontend spell it,
/// data-dir-relative with forward slashes.
pub fn state_rel(name: &str) -> String {
    format!("{STATE_DIR}/{name}")
}

/// The downloaded speech, voice and alignment models, one folder per kind.
pub fn models_dir(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("models")
}

/// Scratch space on the library's volume, so a finished file lands by rename.
pub fn scratch_dir(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("tmp")
}

/// Where the in-app browser's downloads are written until they are placed.
pub fn incoming_downloads_dir(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("downloads").join(".incoming")
}

/// What each synced Canvas file was when it was last downloaded.
pub fn file_manifest_path(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("file-manifest.json")
}

/// MinerU's daily quota ledger.
pub fn mineru_usage_path(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("mineru-usage.json")
}

/// Voyage's spend guard.
pub fn voyage_usage_path(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("voyage-usage.json")
}
