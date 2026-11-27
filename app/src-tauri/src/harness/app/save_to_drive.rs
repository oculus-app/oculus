//! Keeping a chat output: a picture, page or file an agent made in the
//! workspace, or one the student attached, copied into a Drive folder they
//! picked. Only what `protected::savable` allows, checked again here on the
//! source the frontend names, never on an earlier answer. The frontend
//! records the copy's row (`recordUploads`) and remembers the save
//! (`chat_saves`, `lib/drive/chatSaves.ts`). docs/harness.md, "Saving a chat
//! output to Drive".

use std::path::Path;

use crate::harness::protected::{savable, SourceStamp};
use crate::library::drive::ops::guard::drive_target;
use crate::library::files::uploads::{import_bytes_as, ImportOutcome};

/// What a save made: the copy (or why not) and the source's stamp, which
/// the frontend keeps with the save.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedCopy {
    pub outcome: ImportOutcome,
    pub stamp: SourceStamp,
}

/// For each data-dir-relative path (`.oculus/agents/…`), its stamp when the
/// student may save it, else null: one call for every path a chat shows.
#[tauri::command]
pub async fn drive_savable(paths: Vec<String>) -> Result<Vec<Option<SourceStamp>>, String> {
    crate::runtime::blocking::run(move || {
        let data_dir = crate::library::paths::data_dir();
        Ok(paths
            .iter()
            .map(|path| savable(&data_dir, path).map(|s| s.stamp))
            .collect())
    })
    .await
}

/// Copy `source` into `target_dir` (data-dir-relative, `""` for the top
/// level) under `name`, or its own name.
#[tauri::command]
pub async fn drive_save_copy(
    source: String,
    target_dir: String,
    name: Option<String>,
) -> Result<SavedCopy, String> {
    crate::runtime::blocking::run(move || {
        let data_dir = crate::library::paths::data_dir();
        save_copy(&data_dir, &source, &target_dir, name.as_deref())
    })
    .await
}

fn save_copy(
    data_dir: &Path,
    source: &str,
    target_dir: &str,
    name: Option<&str>,
) -> Result<SavedCopy, String> {
    let source = savable(data_dir, source).ok_or("That file can't be saved to Drive.")?;
    let target = drive_target(data_dir, target_dir)?;
    let (bytes, stamp) = source.read()?;
    let own_name = source
        .path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    let name = name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or(own_name);
    Ok(SavedCopy {
        outcome: import_bytes_as(data_dir, &target, name, bytes),
        stamp,
    })
}

#[cfg(test)]
#[cfg(unix)]
mod tests;
