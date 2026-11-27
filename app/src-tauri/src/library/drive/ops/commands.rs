//! The folder commands the browser calls (`app/src/lib/drive/commands.ts`);
//! deletes are `delete::commands`.
//! Each refuses with a JSON-serialised `DriveError`, and announces what it
//! did on `drive-changed`.

use sqlx::SqlitePool;
use tauri::AppHandle;

use super::copy::copy_to_own_at;
use super::create::create_folder_at;
use super::error::{DriveError, DriveResult};
use super::events::{emit, DriveChange, Moved};
use super::moves::{blocking, move_entries_at, rename_entry_at, Moves};
use super::rows::home_ids;

pub(super) async fn pool() -> DriveResult<SqlitePool> {
    crate::db::store::open_pool().await.map_err(DriveError::io)
}

/// Emit `change` on `drive-changed` with the homes its paths are in.
pub async fn announce(app: &AppHandle, pool: &SqlitePool, mut change: DriveChange) {
    let paths: Vec<String> = change
        .moved
        .iter()
        .flat_map(|m| [m.from.clone(), m.to.clone()])
        .chain(change.removed.iter().cloned())
        .chain(change.added.iter().cloned())
        .collect();
    change.subject_ids = home_ids(pool, &paths).await;
    emit(app, &change);
}

fn moved(moves: &Moves) -> Vec<Moved> {
    moves
        .iter()
        .filter(|(from, to)| from != to)
        .map(|(from, to)| Moved {
            from: from.clone(),
            to: to.clone(),
        })
        .collect()
}

pub(super) fn data_dir() -> std::path::PathBuf {
    crate::library::paths::data_dir()
}

#[tauri::command]
pub async fn create_folder(app: AppHandle, rel: String) -> Result<String, String> {
    let made = blocking(move || create_folder_at(&data_dir(), &rel)).await?;
    let pool = pool().await?;
    let change = DriveChange {
        added: vec![made.clone()],
        ..DriveChange::default()
    };
    announce(&app, &pool, change).await;
    pool.close().await;
    Ok(made)
}

#[tauri::command]
pub async fn rename_entry(app: AppHandle, rel: String, new_name: String) -> Result<String, String> {
    let pool = pool().await?;
    let result = rename_entry_at(&data_dir(), &pool, &rel, &new_name).await;
    if let Ok(moves) = &result {
        let change = DriveChange {
            moved: moved(moves),
            ..DriveChange::default()
        };
        announce(&app, &pool, change).await;
    }
    pool.close().await;
    let moves = result?;
    Ok(moves.into_iter().next().map(|(_, to)| to).unwrap_or(rel))
}

#[tauri::command]
pub async fn move_entries(
    app: AppHandle,
    rels: Vec<String>,
    target_dir: String,
) -> Result<Vec<String>, String> {
    let pool = pool().await?;
    let result = move_entries_at(&data_dir(), &pool, &rels, &target_dir).await;
    if let Ok(moves) = &result {
        let change = DriveChange {
            moved: moved(moves),
            ..DriveChange::default()
        };
        announce(&app, &pool, change).await;
    }
    pool.close().await;
    Ok(result?.into_iter().map(|(_, to)| to).collect())
}

#[tauri::command]
pub async fn copy_to_own(
    app: AppHandle,
    rels: Vec<String>,
    target_dir: String,
) -> Result<Vec<String>, String> {
    let pool = pool().await?;
    let result = copy_to_own_at(&data_dir(), &pool, &rels, &target_dir).await;
    if let Ok(copies) = &result {
        let change = DriveChange {
            added: copies.clone(),
            ..DriveChange::default()
        };
        announce(&app, &pool, change).await;
    }
    pool.close().await;
    Ok(result?)
}
