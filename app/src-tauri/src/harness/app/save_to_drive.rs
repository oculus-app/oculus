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
mod tests {
    use super::*;
    use crate::test_support::Scratch;

    fn library(name: &str) -> Scratch {
        let root = Scratch::new(name);
        let ws = root.join(".oculus/agents");
        std::fs::create_dir_all(ws.join("outputs")).unwrap();
        std::fs::create_dir_all(ws.join("memories")).unwrap();
        std::fs::write(ws.join("outputs/dfa-even-zeros.svg"), "<svg/>").unwrap();
        std::fs::write(ws.join("memories/explain-plainly.md"), "memory").unwrap();
        std::fs::write(ws.join("TASTE.md"), "taste").unwrap();
        std::fs::create_dir_all(root.join("courses/COMP30026/Diagrams")).unwrap();
        std::fs::create_dir_all(root.join("courses/COMP30026/Course")).unwrap();
        root
    }

    #[test]
    fn a_picture_is_copied_into_the_picked_folder() {
        let root = library("save-copy");
        let saved = save_copy(
            &root,
            ".oculus/agents/outputs/dfa-even-zeros.svg",
            "courses/COMP30026/Diagrams",
            None,
        )
        .unwrap();
        let file = saved.outcome.file.unwrap();
        assert_eq!(
            file.relative_path,
            "courses/COMP30026/Diagrams/dfa-even-zeros.svg"
        );
        assert_eq!(saved.stamp.size, 6);
        assert_eq!(
            std::fs::read(root.join(&file.relative_path)).unwrap(),
            b"<svg/>"
        );
        // At the top level, under the name the student gave.
        let top = save_copy(
            &root,
            ".oculus/agents/outputs/dfa-even-zeros.svg",
            "",
            Some(" even.svg "),
        )
        .unwrap();
        assert_eq!(top.outcome.file.unwrap().relative_path, "even.svg");
    }

    #[test]
    fn the_agents_own_files_are_refused_and_nothing_lands() {
        let root = library("save-refused");
        let outputs = root.join(".oculus/agents/outputs");
        std::os::unix::fs::symlink(
            root.join(".oculus/agents/TASTE.md"),
            outputs.join("taste.md"),
        )
        .unwrap();
        for source in [
            ".oculus/agents/memories/explain-plainly.md",
            ".oculus/agents/TASTE.md",
            ".oculus/agents/outputs/../TASTE.md",
            ".oculus/agents/outputs/../memories/explain-plainly.md",
            ".oculus/agents/outputs/taste.md",
            ".oculus/oculus.db",
        ] {
            assert!(
                save_copy(&root, source, "courses/COMP30026/Diagrams", None).is_err(),
                "{source}"
            );
        }
        let landed = std::fs::read_dir(root.join("courses/COMP30026/Diagrams"))
            .unwrap()
            .count();
        assert_eq!(landed, 0);
    }

    #[test]
    fn a_folder_the_student_cant_add_to_is_refused() {
        let root = library("save-target");
        for target in [
            "courses/COMP30026/Course",
            ".oculus/agents/outputs",
            "courses",
        ] {
            assert!(
                save_copy(
                    &root,
                    ".oculus/agents/outputs/dfa-even-zeros.svg",
                    target,
                    None
                )
                .is_err(),
                "{target}"
            );
        }
    }
}
