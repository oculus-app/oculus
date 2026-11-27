//! The delete commands (`app/src/lib/drive/commands.ts`): a delete returns
//! the pending handle the toast holds, which Undo or the toast's closing
//! names; never a path. A pending delete nothing finishes (the page went
//! away) is final after `UNATTENDED`, and every one is at the app's exit.

use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;

use super::super::commands::{announce, data_dir, pool};
use super::super::events::DriveChange;
use super::{finish_at, send_at, take_all_in, undo_at, Sent, SystemBin};

/// Longer than any toast stays.
const UNATTENDED: Duration = Duration::from_secs(60);

/// Sends `rels` to the Trash; announces them as removed.
#[tauri::command]
pub async fn delete_entries(app: AppHandle, rels: Vec<String>) -> Result<Sent, String> {
    let pool = pool().await?;
    let sent = send_at(&data_dir(), &pool, &rels, Arc::new(SystemBin)).await;
    if let Ok(sent) = &sent {
        let change = DriveChange {
            removed: sent.removed.clone(),
            ..DriveChange::default()
        };
        announce(&app, &pool, change).await;
    }
    pool.close().await;
    let sent = sent?;
    finish_unattended(&sent);
    Ok(sent)
}

/// Make `sent` final after `UNATTENDED` if nothing has by then.
pub fn finish_unattended(sent: &Sent) {
    if let Some(handle) = sent.handle {
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(UNATTENDED).await;
            let _ = drive_delete_finish(handle).await;
        });
    }
}

/// Makes the pending delete final: the toast closed.
#[tauri::command]
pub async fn drive_delete_finish(handle: u64) -> Result<(), String> {
    let pool = pool().await?;
    let done = finish_at(&pool, handle).await;
    pool.close().await;
    Ok(done?)
}

/// Undo: back out of the Trash; returns where each entry is now and
/// announces them as added.
#[tauri::command]
pub async fn drive_delete_undo(app: AppHandle, handle: u64) -> Result<Vec<String>, String> {
    let pool = pool().await?;
    let back = undo_at(&pool, handle).await;
    if let Ok(back) = &back {
        let change = DriveChange {
            added: back.clone(),
            ..DriveChange::default()
        };
        announce(&app, &pool, change).await;
    }
    pool.close().await;
    Ok(back?)
}

/// At the app's exit: every pending delete is final, as its toast would
/// have made it.
pub fn finish_all_at_exit() {
    let pending = take_all_in(&data_dir());
    if pending.is_empty() {
        return;
    }
    tauri::async_runtime::block_on(async move {
        let Ok(pool) = pool().await else { return };
        for one in pending {
            if let Err(e) = super::finish::finish(&pool, one).await {
                elog!("[oculus] drive: finishing a delete at exit: {}", e.message);
            }
        }
        pool.close().await;
    });
}
