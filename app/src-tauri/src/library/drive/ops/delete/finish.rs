//! The second step: the rows, with everything hung off them, then the app's
//! own leftovers and a drawing's page pictures. What went to the Trash
//! stays there, for Finder's Put Back.

use std::path::Path;

use sqlx::SqlitePool;

use super::super::error::DriveResult;
use super::super::moves::blocking;
use super::super::rows::{db, delete_ids};
use super::{take, Pending};
use crate::library::paths::notebook_pages_dir;

/// Make the pending delete `handle` final; nothing when it is no longer
/// pending.
pub async fn finish_at(pool: &SqlitePool, handle: u64) -> DriveResult<()> {
    match take(handle) {
        Some(pending) => finish(pool, pending).await,
        None => Ok(()),
    }
}

pub(super) async fn finish(pool: &SqlitePool, pending: Pending) -> DriveResult<()> {
    let ids: Vec<i64> = pending.items.iter().flat_map(|i| i.ids.clone()).collect();
    let mut tx = pool.begin().await.map_err(db)?;
    delete_ids(&mut tx, &ids).await?;
    tx.commit().await.map_err(db)?;
    blocking(move || {
        for path in pending.items.iter().flat_map(|i| &i.leftovers) {
            remove(&pending.data_dir, path);
        }
        for id in ids {
            if notebook_pages_dir(&pending.data_dir, id).is_dir() {
                if let Err(e) =
                    crate::library::files::whiteboards::snapshots::remove_at(&pending.data_dir, id)
                {
                    elog!("[oculus] drive: page pictures of file {id}: {e}");
                }
            }
        }
        Ok(())
    })
    .await
}

/// A leftover the delete recorded, only inside the data dir and never
/// through a link.
fn remove(data_dir: &Path, path: &Path) {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return;
    };
    if !path.starts_with(data_dir) || meta.file_type().is_symlink() {
        return;
    }
    let removed = if meta.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    };
    if let Err(e) = removed {
        elog!("[oculus] drive: could not remove {}: {e}", path.display());
    }
}
