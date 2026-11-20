//! A chat's attachments when the chat is deleted: the files the student
//! pasted or dropped into it (`agents/attachments/`), never what the agent
//! made. The folder is shared by every chat, so a file goes only while no
//! other chat's messages or queue name it; the check runs again at delete
//! time, after the chat's own rows are gone.

use sqlx::SqlitePool;

use crate::harness::attach::{attachment_paths, remove_attachments};

/// Every message text a chat holds: its rows, and its queue's waiting sends.
/// `None` reads every chat.
const TEXTS: &str = "SELECT content AS text FROM harness_items
     WHERE content LIKE '%attachments/%' AND (?1 IS NULL OR thread_id = ?1)
     UNION ALL
     SELECT queued_text AS text FROM harness_runs
     WHERE queued_text LIKE '%attachments/%' AND (?1 IS NULL OR thread_id = ?1)";

/// Whether any chat other than `except` names the attachment.
const NAMED_ELSEWHERE: &str = "SELECT EXISTS(
       SELECT 1 FROM harness_items
       WHERE instr(content, ?1) > 0 AND (?2 IS NULL OR thread_id != ?2)
       UNION ALL
       SELECT 1 FROM harness_runs
       WHERE instr(queued_text, ?1) > 0 AND (?2 IS NULL OR thread_id != ?2))";

/// The attachments `thread_id` names that no other chat does, as
/// `agents/attachments/<name>`, whether or not each is still on disk.
pub(crate) async fn own_attachments(
    pool: &SqlitePool,
    thread_id: i64,
) -> Result<Vec<String>, String> {
    let texts: Vec<String> = sqlx::query_scalar(TEXTS)
        .bind(thread_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let mut paths: Vec<String> = Vec::new();
    for path in texts.iter().flat_map(|t| attachment_paths(t)) {
        if !paths.contains(&path) && !named_elsewhere(pool, &path, Some(thread_id)).await? {
            paths.push(path);
        }
    }
    Ok(paths)
}

/// Whether a chat other than `except` (any chat, with `None`) names `path`.
async fn named_elsewhere(
    pool: &SqlitePool,
    path: &str,
    except: Option<i64>,
) -> Result<bool, String> {
    let name = path.rsplit('/').next().unwrap_or(path);
    sqlx::query_scalar(NAMED_ELSEWHERE)
        .bind(format!("attachments/{name}"))
        .bind(except)
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())
}

/// The attachments of `paths` no chat names any more, removed from disk.
pub(crate) async fn remove_unnamed(
    pool: &SqlitePool,
    data_dir: &std::path::Path,
    paths: &[String],
) -> Result<Vec<String>, String> {
    let mut unnamed = Vec::new();
    for path in paths {
        if !named_elsewhere(pool, path, None).await? {
            unnamed.push(path.clone());
        }
    }
    let data_dir = data_dir.to_path_buf();
    crate::runtime::blocking::run(move || remove_attachments(&data_dir, &unnamed)).await
}

/// The files only this chat attached, for the delete dialog's checkbox.
#[tauri::command]
pub async fn harness_thread_attachments(thread_id: i64) -> Result<Vec<String>, String> {
    let pool = crate::db::store::open_pool().await?;
    own_attachments(&pool, thread_id).await
}

/// After a chat is deleted: remove the attachments it listed that no chat
/// still names. Returns the paths removed.
#[tauri::command]
pub async fn harness_delete_attachments(paths: Vec<String>) -> Result<Vec<String>, String> {
    let pool = crate::db::store::open_pool().await?;
    let removed = remove_unnamed(&pool, &crate::library::paths::data_dir(), &paths).await?;
    if removed.len() < paths.len() {
        crate::elog!(
            "harness: kept {} of {} attachments a deleted chat named (still named elsewhere, or gone)",
            paths.len() - removed.len(),
            paths.len()
        );
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use sqlx::sqlite::SqlitePoolOptions;

    use super::*;
    use crate::harness::store::create_thread;
    use crate::harness::Provider;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for migration in crate::db::migrations::all() {
            sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
        }
        pool
    }

    async fn say(pool: &SqlitePool, thread: i64, text: &str) {
        sqlx::query("INSERT INTO harness_items (thread_id, kind, content) VALUES (?1, 'user', ?2)")
            .bind(thread)
            .bind(text)
            .execute(pool)
            .await
            .unwrap();
    }

    const MINE: &str = "agents/attachments/20261120-063301-0a1b2c3d.png";
    const SHARED: &str = "agents/attachments/20261120-063302-00ff00ff.pdf";

    #[tokio::test]
    async fn a_chat_owns_only_what_no_other_chat_names() {
        let pool = pool().await;
        let a = create_thread(&pool, Provider::Claude, None, None, None, "a")
            .await
            .unwrap();
        let b = create_thread(&pool, Provider::Claude, None, None, None, "b")
            .await
            .unwrap();
        say(&pool, a, "see ./attachments/20261120-063301-0a1b2c3d.png").await;
        say(&pool, a, "and ./attachments/20261120-063302-00ff00ff.pdf").await;
        say(
            &pool,
            b,
            "same pdf ./attachments/20261120-063302-00ff00ff.pdf",
        )
        .await;
        assert_eq!(
            own_attachments(&pool, a).await.unwrap(),
            vec![MINE.to_string()]
        );
        assert!(own_attachments(&pool, b).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn removal_rechecks_and_keeps_a_file_still_named() {
        let pool = pool().await;
        let data = crate::test_support::Scratch::new("thread-files");
        let dir = data.join("agents").join("attachments");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("20261120-063301-0a1b2c3d.png"), b"p").unwrap();
        std::fs::write(dir.join("20261120-063302-00ff00ff.pdf"), b"d").unwrap();
        let b = create_thread(&pool, Provider::Claude, None, None, None, "b")
            .await
            .unwrap();
        // Named again after the dialog listed it: it stays.
        say(&pool, b, "./attachments/20261120-063302-00ff00ff.pdf").await;
        let removed = remove_unnamed(&pool, &data, &[MINE.into(), SHARED.into()])
            .await
            .unwrap();
        assert_eq!(removed, vec![MINE.to_string()]);
        assert!(!dir.join("20261120-063301-0a1b2c3d.png").exists());
        assert!(dir.join("20261120-063302-00ff00ff.pdf").exists());
    }
}
