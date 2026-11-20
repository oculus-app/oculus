//! Link a command's newly made video in the same transaction as its tool row.

use crate::harness::event::studio_command::is_studio_new;
use crate::studio::videos;
use serde_json::Value;
use sqlx::SqliteConnection;
use std::path::Path;

pub(super) async fn link_created(
    conn: &mut SqliteConnection,
    thread: i64,
    item: i64,
    name: &str,
    input: &Value,
    output: &str,
    root: &Path,
) -> Result<(), String> {
    if !is_studio_new(name, input) {
        return Ok(());
    }
    let Some(slug) = printed_slug(output, root) else {
        return Ok(());
    };
    // The row's run is the authority, not whichever run happens to be live
    // when a delayed completion arrives. A second creation stays unlinked.
    let meta: Option<String> = sqlx::query_scalar(
        "SELECT u.meta FROM harness_items t JOIN harness_runs r ON r.id = t.run_id
         JOIN harness_items u ON u.id = r.initiating_item_id
         WHERE t.id = ?1 AND t.thread_id = ?2 AND u.kind = 'user'",
    )
    .bind(item)
    .bind(thread)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| e.to_string())?
    .flatten();
    let length = meta
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| v.get("studio")?.get("lengthSecs")?.as_i64())
        .filter(|n| *n > 0);
    // Never take a folder from another thread, including a duplicate event.
    sqlx::query(
        "INSERT INTO studio_videos (slug, thread_id, length_secs)
         SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM studio_videos WHERE thread_id = ?2)
         AND EXISTS (SELECT 1 FROM harness_threads WHERE id = ?2)
         ON CONFLICT(slug) DO NOTHING",
    )
    .bind(slug)
    .bind(thread)
    .bind(length)
    .execute(conn)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn printed_slug(output: &str, root: &Path) -> Option<String> {
    // CLI text may be coloured; JSON is emitted when --json is selected.
    let ansi = regex::Regex::new(r"\x1b\[[0-9;]*m").ok()?;
    let clean = ansi.replace_all(output, "");
    let json = serde_json::from_str::<Value>(clean.trim()).ok();
    let dir = json
        .as_ref()
        .and_then(|v| v.get("dir")?.as_str())
        .or_else(|| clean.lines().find_map(|l| l.trim().strip_prefix("made ")))?;
    let path = Path::new(dir.trim());
    if !path.is_absolute() || path.parent()? != root {
        return None;
    }
    let slug = path.file_name()?.to_str()?;
    // video_in canonicalises and refuses symlinks outside the video root.
    videos::video_in(root, slug).ok()?;
    Some(slug.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::{store, Provider};
    use serde_json::json;
    use sqlx::Row;

    #[tokio::test]
    async fn links_once_with_the_originating_messages_length() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for migration in crate::db::migrations::all() {
            sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
        }
        let thread = store::create_thread(&pool, Provider::Claude, None, None, None, "video")
            .await
            .unwrap();
        let temp =
            std::env::temp_dir().join(format!("oculus-studio-link-{}", store::fresh_receipt()));
        std::fs::create_dir_all(&temp).unwrap();
        for slug in ["first", "scratch"] {
            videos::create_in(
                &temp,
                &videos::NewVideo {
                    slug: slug.into(),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        let run = store::begin_run(
            &pool,
            &store::SendIntent {
                thread_id: thread,
                provider: Provider::Claude,
                model: None,
                effort: None,
                binding: None,
                receipt: store::fresh_receipt(),
                text: "video".into(),
                at: None,
                continuation: None,
                queued: None,
                options: Some(
                    json!({"studioStyle":{"format":"video","lengthSecs":90}}).to_string(),
                ),
            },
        )
        .await
        .unwrap();
        sqlx::query("UPDATE harness_items SET meta = ?1 WHERE id = ?2")
            .bind(json!({"studio":{"lengthSecs":90}}).to_string())
            .bind(run.item_id)
            .execute(&pool)
            .await
            .unwrap();
        let item = sqlx::query(
            "INSERT INTO harness_items(thread_id, kind, run_id) VALUES (?1, 'tool', ?2)",
        )
        .bind(thread)
        .bind(run.run_id)
        .execute(&pool)
        .await
        .unwrap()
        .last_insert_rowid();
        let mut conn = pool.acquire().await.unwrap();
        for slug in ["first", "scratch", "first"] {
            link_created(
                &mut conn,
                thread,
                item,
                "Bash",
                &json!({"command":"oculus studio new anything"}),
                &format!("made {}", temp.join(slug).display()),
                &temp,
            )
            .await
            .unwrap();
        }
        let row = sqlx::query("SELECT slug, length_secs FROM studio_videos WHERE thread_id = ?1")
            .bind(thread)
            .fetch_one(&mut *conn)
            .await
            .unwrap();
        assert_eq!(row.get::<String, _>("slug"), "first");
        assert_eq!(row.get::<i64, _>("length_secs"), 90);
        assert!(printed_slug("made /tmp/elsewhere", &temp).is_none());
        assert!(printed_slug(&format!("made {}/../first", temp.display()), &temp).is_none());
        assert_eq!(
            printed_slug(&json!({"dir":temp.join("first")}).to_string(), &temp).as_deref(),
            Some("first")
        );
        std::fs::remove_dir_all(temp).unwrap();
    }
}
