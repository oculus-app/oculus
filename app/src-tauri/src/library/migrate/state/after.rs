//! What follows the renames, each a no-op the second time: the rules that
//! keep old chat paths readable, the subjects' links, the agent docs and
//! opencode's config at their new place, and the old broker's leftovers.

use std::path::Path;

use super::names::{CITED, OLD_BIN, OLD_BIN_ENTRIES, OLD_SOCKET};
use crate::library::migrate::rules::Rule;
use crate::library::migrate::{record_moves, OwnRule};
use crate::library::paths::state_rel;

/// A `path_moves` row for each folder old chat history names (`CITED`).
/// Returns the rows written; nothing without a database.
pub async fn record_cited(data_dir: &Path) -> Result<usize, String> {
    let Some(pool) = crate::library::migrate::open(data_dir, false).await? else {
        return Ok(0);
    };
    // Only a database from before `path_moves` (migration 64) is brought up
    // here; any other is left for the launch's own migration.
    let has_table: Option<i64> =
        sqlx::query_scalar("SELECT 1 FROM sqlite_master WHERE name = 'path_moves'")
            .fetch_optional(&pool)
            .await
            .map_err(|e| format!("read the database's schema: {e}"))?;
    if has_table.is_none() {
        crate::library::migrate::db::ensure(&pool).await?;
    }
    let renames: Vec<(Rule, OwnRule)> = CITED
        .iter()
        .map(|name| {
            let rule = Rule {
                old: name.to_string(),
                new: state_rel(name),
            };
            (rule, OwnRule::Replace)
        })
        .collect();
    let mut conn = pool.acquire().await.map_err(|e| e.to_string())?;
    let written = record_moves(&mut *conn, &renames).await?;
    drop(conn);
    pool.close().await;
    Ok(written)
}

/// The subjects' memories links re-pointed and their root `AGENTS.md` links
/// removed (`agents::link_all`), then the docs, skills and opencode's config
/// written again where they are now. Only a library that has an agents'
/// folder: the move makes none.
pub fn regenerate(data_dir: &Path) -> Result<usize, String> {
    if !crate::agents::agents_dir(data_dir).is_dir() {
        return Ok(0);
    }
    let links = crate::agents::link_all(data_dir)?;
    crate::agents::ensure_library_docs(data_dir)?;
    crate::library::migrate::regenerate_opencode_config(data_dir);
    Ok(links.linked.len())
}

/// The old install folder and socket at the top, by name: what keyd's
/// install put there and nothing else. A folder left holding anything more
/// stays, and is said once in the log.
pub fn remove_old_broker_files(data_dir: &Path) {
    let socket = data_dir.join(OLD_SOCKET);
    if is_socket(&socket) {
        std::fs::remove_file(&socket).ok();
    }
    let bin = data_dir.join(OLD_BIN);
    if !std::fs::symlink_metadata(&bin).is_ok_and(|meta| meta.is_dir()) {
        return;
    }
    for name in OLD_BIN_ENTRIES {
        let path = bin.join(name);
        let removed = match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.is_dir() => std::fs::remove_dir_all(&path),
            Ok(_) => std::fs::remove_file(&path),
            Err(_) => Ok(()),
        };
        if let Err(e) = removed {
            elog!(
                "[oculus] state move: could not remove {}: {e}",
                path.display()
            );
        }
    }
    std::fs::remove_file(bin.join(".DS_Store")).ok();
    if std::fs::remove_dir(&bin).is_err() {
        elog!(
            "[oculus] state move: {} holds something Oculus did not put there, left",
            bin.display()
        );
    }
}

#[cfg(unix)]
fn is_socket(path: &Path) -> bool {
    use std::os::unix::fs::FileTypeExt;
    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_socket())
}

/// Windows' endpoint is a named pipe, never a file.
#[cfg(not(unix))]
fn is_socket(_path: &Path) -> bool {
    false
}
