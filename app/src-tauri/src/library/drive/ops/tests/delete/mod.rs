//! Deletes to the Trash, with a stand-in Trash in the scratch library: no
//! test trashes anything for real.

mod finish;
mod send;
mod undo;

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use super::*;
use crate::library::drive::ops::delete::{send_at, Bin, Sent};

/// Moves into `<library>/.fake-trash/`, numbered as the Trash renames a clash.
pub struct FakeBin {
    dir: PathBuf,
    next: AtomicU64,
    /// Refuse this name, as a volume with no Trash refuses.
    refuse: Option<String>,
    /// Say nothing of where it went, as Windows does.
    silent: bool,
}

impl FakeBin {
    pub fn new(lib: &Lib) -> Arc<Self> {
        Arc::new(Self::with(lib, None, false))
    }

    pub fn with(lib: &Lib, refuse: Option<&str>, silent: bool) -> Self {
        let dir = lib.path(".fake-trash");
        std::fs::create_dir_all(&dir).unwrap();
        Self {
            dir,
            next: AtomicU64::new(1),
            refuse: refuse.map(str::to_string),
            silent,
        }
    }

    /// What is in the stand-in Trash, by name.
    pub fn names(lib: &Lib) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(lib.path(".fake-trash"))
            .map(|d| {
                d.flatten()
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        names
    }
}

impl Bin for FakeBin {
    fn put(&self, path: &Path) -> Result<Option<PathBuf>, String> {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        if self.refuse.as_deref() == Some(name.as_str()) {
            return Err(format!("{name}: this volume has no Trash"));
        }
        let to = self.dir.join(format!(
            "{}-{name}",
            self.next.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::rename(path, &to).map_err(|e| e.to_string())?;
        Ok((!self.silent).then_some(to))
    }
}

pub async fn send(lib: &Lib, bin: Arc<FakeBin>, paths: &[&str]) -> Sent {
    send_at(&lib.dir, &lib.pool, &rels(paths), bin)
        .await
        .unwrap()
}

/// What hangs off a file: a note's version, a task link, a Studio export
/// link and a chat-save link.
pub async fn link_everything(lib: &Lib, id: i64) {
    sqlx::raw_sql(&format!(
        "INSERT INTO document_versions (file_id, kind, text, hash) VALUES ({id}, 'auto', 'x', 'h');
         INSERT INTO projects (id, name, columns) VALUES ({id}, 'Essay', '[]');
         INSERT INTO project_tasks (id, project_id, title, column_id, position)
           VALUES ({id}, {id}, 'Read', 'todo', 0);
         INSERT INTO task_files (task_id, file_id) VALUES ({id}, {id});
         INSERT INTO studio_exports (slug, preset, file_id, size, modified_ms)
           VALUES ('v{id}', 'final', {id}, 1, 1);
         INSERT INTO chat_saves (source, file_id, source_size, source_mtime)
           VALUES ('.oculus/agents/out{id}.md', {id}, 1, 1);"
    ))
    .execute(&lib.pool)
    .await
    .unwrap();
}

/// How many of `link_everything`'s rows still name `id`.
pub async fn links_of(lib: &Lib, id: i64) -> i64 {
    sqlx::query_scalar(
        "SELECT (SELECT COUNT(*) FROM document_versions WHERE file_id = ?1)
              + (SELECT COUNT(*) FROM task_files WHERE file_id = ?1)
              + (SELECT COUNT(*) FROM studio_exports WHERE file_id = ?1)
              + (SELECT COUNT(*) FROM chat_saves WHERE file_id = ?1)",
    )
    .bind(id)
    .fetch_one(&lib.pool)
    .await
    .unwrap()
}
