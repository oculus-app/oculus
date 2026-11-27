//! The first step: each entry to the Trash, under the job fence, nothing
//! else touched. When one cannot go (a volume with no Trash), those already
//! sent come back and the delete fails: nothing is ever unlinked instead.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use sqlx::SqlitePool;

use super::super::busy::fenced;
use super::super::companions::derived_dir;
use super::super::error::{DriveError, DriveResult};
use super::super::guard::{files_under, own_entry, Entry};
use super::super::moves::blocking;
use super::super::rows;
use super::{finish, keep, take_all_in, Bin, Item, Pending};
use crate::library::paths::artifact_slots;

/// What a delete did.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sent {
    /// The pending delete Undo names, or `None` when it is final already
    /// (the platform cannot say where the Trash put it).
    pub handle: Option<u64>,
    /// The entries' paths, in the order asked.
    pub removed: Vec<String>,
}

/// Send `rels` to the Trash. A path inside another one sent goes with it.
/// A delete still pending in this library is made final first: one Undo at
/// a time.
pub async fn send_at(
    data_dir: &Path,
    pool: &SqlitePool,
    rels: &[String],
    bin: Arc<dyn Bin>,
) -> DriveResult<Sent> {
    for older in take_all_in(data_dir) {
        if let Err(e) = finish::finish(pool, older).await {
            elog!("[oculus] drive: finishing an earlier delete: {}", e.message);
        }
    }
    let picked = rels
        .iter()
        .map(|rel| own_entry(data_dir, rel))
        .collect::<DriveResult<Vec<Entry>>>()?;
    let entries: Vec<Entry> = picked
        .iter()
        .filter(|e| {
            !picked
                .iter()
                .any(|o| o.dir && e.rel.starts_with(&format!("{}/", o.rel)))
        })
        .cloned()
        .collect();
    let mut ids = Vec::new();
    for entry in &entries {
        ids.push(rows::ids_at(pool, &entry.rel, entry.dir).await?);
    }
    let files: Vec<String> = entries.iter().flat_map(files_under).collect();
    let dir = data_dir.to_path_buf();
    let sent = entries.clone();
    let (landed, held) = blocking(move || {
        fenced(&dir, &files, || {
            let leftovers: Vec<Vec<PathBuf>> = sent.iter().map(|e| leftovers(&dir, e)).collect();
            Ok((to_trash(&sent, &*bin)?, leftovers))
        })
    })
    .await?;
    drop(held);
    let (landed, leftovers) = landed;
    let removed = entries.iter().map(|e| e.rel.clone()).collect();
    let items: Vec<Item> = entries
        .into_iter()
        .zip(landed)
        .zip(ids.into_iter().zip(leftovers))
        .map(|((entry, trashed), (ids, leftovers))| Item {
            rel: entry.rel,
            path: entry.path,
            dir: entry.dir,
            trashed: trashed.unwrap_or_default(),
            ids,
            leftovers,
        })
        .collect();
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let pending = Pending {
        id: NEXT.fetch_add(1, Ordering::Relaxed),
        data_dir: data_dir.to_path_buf(),
        items,
    };
    // No way back out of the Trash: final now.
    if pending
        .items
        .iter()
        .any(|i| i.trashed.as_os_str().is_empty())
    {
        finish::finish(pool, pending).await?;
        return Ok(Sent {
            handle: None,
            removed,
        });
    }
    let handle = Some(pending.id);
    keep(pending);
    Ok(Sent { handle, removed })
}

/// Each entry to the Trash in turn; on a refusal the ones sent come back.
fn to_trash(entries: &[Entry], bin: &dyn Bin) -> DriveResult<Vec<Option<PathBuf>>> {
    let mut landed = Vec::new();
    for entry in entries {
        match bin.put(&entry.path) {
            Ok(at) => landed.push(at),
            Err(message) => {
                for (sent, at) in entries.iter().zip(&landed) {
                    let back = at
                        .as_deref()
                        .map(|at| std::fs::rename(at, &sent.path))
                        .unwrap_or_else(|| Err(std::io::ErrorKind::NotFound.into()));
                    if let Err(e) = back {
                        elog!("[oculus] drive: {} stays in the Trash: {e}", sent.rel);
                    }
                }
                return Err(DriveError::io(message));
            }
        }
    }
    Ok(landed)
}

/// What the app keeps of an entry beside it that a final delete removes: a
/// file's parse artifacts and converted PDF, a folder's derived records.
fn leftovers(data_dir: &Path, entry: &Entry) -> Vec<PathBuf> {
    if entry.dir {
        return derived_dir(data_dir, &entry.rel)
            .filter(|d| d.is_dir())
            .into_iter()
            .collect();
    }
    artifact_slots(data_dir, &entry.rel)
        .into_iter()
        .map(|(_, path)| path)
        .filter(|path| std::fs::symlink_metadata(path).is_ok())
        .collect()
}
