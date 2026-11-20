//! Link a command's newly made video in the same transaction as its tool row.
//! A scratch video (`studio new --scratch`, or any made by a turn an Ask for
//! a change send started, whose user row carries `libraryChange`) is never
//! linked.

use crate::harness::event::studio_command::new_slugs;
use crate::studio::videos;
use serde_json::Value;
use sqlx::SqliteConnection;
use std::path::{Path, PathBuf};

/// The folder links are checked against: the data directory's video root,
/// or a scratch folder in a test.
pub(super) fn videos_root() -> PathBuf {
    #[cfg(test)]
    if let Some(root) = TEST_ROOT.with(|r| r.borrow().clone()) {
        return root;
    }
    videos::videos_dir()
}

#[cfg(test)]
thread_local! {
    static TEST_ROOT: std::cell::RefCell<Option<PathBuf>> = const { std::cell::RefCell::new(None) };
}

pub(super) async fn link_created(
    conn: &mut SqliteConnection,
    thread: i64,
    item: i64,
    name: &str,
    input: &Value,
    output: &str,
    root: &Path,
) -> Result<(), String> {
    let asked = new_slugs(name, input);
    if asked.is_empty() {
        return Ok(());
    }
    let Some(slug) = printed_slug(output, root, &asked) else {
        return Ok(());
    };
    // The row's run is the authority, not whichever run happens to be live
    // when a delayed completion arrives.
    let meta: Option<Value> = sqlx::query_scalar::<_, Option<String>>(
        "SELECT u.meta FROM harness_items t JOIN harness_runs r ON r.id = t.run_id
         JOIN harness_items u ON u.id = r.initiating_item_id
         WHERE t.id = ?1 AND t.thread_id = ?2 AND u.kind = 'user'",
    )
    .bind(item)
    .bind(thread)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| e.to_string())?
    .flatten()
    .and_then(|s| serde_json::from_str(&s).ok());
    // An Ask for a change turn's videos are scratch; a later turn in the same
    // thread asking for a real video links as any other.
    if meta
        .as_ref()
        .and_then(|m| m.get("libraryChange")?.as_bool())
        == Some(true)
    {
        return Ok(());
    }
    // A link whose folder is gone (the video was deleted) frees the thread
    // to make another.
    let linked: Option<String> =
        sqlx::query_scalar("SELECT slug FROM studio_videos WHERE thread_id = ?1")
            .bind(thread)
            .fetch_optional(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    if let Some(old) = linked.filter(|old| videos::video_in(root, old).is_err()) {
        sqlx::query("DELETE FROM studio_videos WHERE slug = ?1")
            .bind(old)
            .execute(&mut *conn)
            .await
            .map_err(|e| e.to_string())?;
    }
    let length = meta
        .as_ref()
        .and_then(|v| v.get("studio")?.get("lengthSecs")?.as_i64())
        .filter(|n| *n > 0);
    // A thread keeps its first video, a duplicate event included. `studio
    // new` refuses a folder that exists, so a row already naming this slug
    // was left by a deleted video, and the new folder takes it over.
    sqlx::query(
        "INSERT INTO studio_videos (slug, thread_id, length_secs)
         SELECT ?1, ?2, ?3 WHERE NOT EXISTS (SELECT 1 FROM studio_videos WHERE thread_id = ?2)
         AND EXISTS (SELECT 1 FROM harness_threads WHERE id = ?2)
         ON CONFLICT(slug) DO UPDATE SET
           thread_id = excluded.thread_id,
           length_secs = excluded.length_secs,
           created_at = datetime('now')",
    )
    .bind(slug)
    .bind(thread)
    .bind(length)
    .execute(conn)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// The first folder the output says was made that the command asked for,
/// so a scratch video made in the same line is passed over. A command that
/// asked for one video and made one folder links it whatever the slug's
/// spelling in the command (`$SLUG`, say).
fn printed_slug(output: &str, root: &Path, asked: &[String]) -> Option<String> {
    // CLI text may be coloured; JSON is emitted when --json is selected,
    // one document per command.
    let ansi = regex::Regex::new(r"\x1b\[[0-9;]*m").ok()?;
    let clean = ansi.replace_all(output, "");
    let whole = serde_json::from_str::<Value>(clean.trim()).ok();
    let dirs: Vec<String> = match whole.as_ref().and_then(|v| v.get("dir")?.as_str()) {
        Some(dir) => vec![dir.to_owned()],
        None => clean
            .lines()
            .filter_map(|l| {
                let l = l.trim();
                l.strip_prefix("made ").map(str::to_owned).or_else(|| {
                    let v = serde_json::from_str::<Value>(l).ok()?;
                    Some(v.get("dir")?.as_str()?.to_owned())
                })
            })
            .collect(),
    };
    let made: Vec<String> = dirs
        .iter()
        .filter_map(|dir| {
            let path = Path::new(dir.trim());
            if !path.is_absolute() || path.parent()? != root {
                return None;
            }
            let slug = path.file_name()?.to_str()?;
            // video_in canonicalises and refuses symlinks outside the video root.
            videos::video_in(root, slug).ok()?;
            Some(slug.to_owned())
        })
        .collect();
    if let ([one], [_]) = (made.as_slice(), asked) {
        return Some(one.clone());
    }
    made.into_iter().find(|slug| asked.contains(slug))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::event::{HarnessEvent, ToolKind};
    use crate::harness::{store, Provider, SendOptions};
    use serde_json::json;
    use sqlx::{Row, SqlitePool};

    async fn pool() -> SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for migration in crate::db::migrations::all() {
            sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
        }
        pool
    }

    fn scratch_root() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("oculus-studio-link-{}", store::fresh_receipt()));
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn make(root: &Path, slug: &str) {
        videos::create_in(
            root,
            &videos::NewVideo {
                slug: slug.into(),
                ..Default::default()
            },
        )
        .unwrap();
    }

    /// A send as production stores it (`queue::stored`), and its run.
    async fn send(pool: &SqlitePool, thread: i64, options: Value) -> store::RunStart {
        let options: SendOptions = serde_json::from_value(options).unwrap();
        store::begin_run(
            pool,
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
                options: Some(store::queue::stored(&options).unwrap()),
            },
        )
        .await
        .unwrap()
    }

    async fn tool(pool: &SqlitePool, thread: i64, run: &store::RunStart) -> i64 {
        sqlx::query("INSERT INTO harness_items(thread_id, kind, run_id) VALUES (?1, 'tool', ?2)")
            .bind(thread)
            .bind(run.run_id)
            .execute(pool)
            .await
            .unwrap()
            .last_insert_rowid()
    }

    async fn link_of(pool: &SqlitePool, thread: i64) -> Option<(String, Option<i64>)> {
        sqlx::query("SELECT slug, length_secs FROM studio_videos WHERE thread_id = ?1")
            .bind(thread)
            .fetch_optional(pool)
            .await
            .unwrap()
            .map(|r| (r.get("slug"), r.get("length_secs")))
    }

    async fn created(
        pool: &SqlitePool,
        thread: i64,
        item: i64,
        line: &str,
        dir: &Path,
        root: &Path,
    ) {
        let mut conn = pool.acquire().await.unwrap();
        link_created(
            &mut conn,
            thread,
            item,
            "Bash",
            &json!({ "command": line }),
            &format!("made {}", dir.display()),
            root,
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn a_styled_send_links_its_video_with_the_length_through_the_tool_event() {
        let pool = pool().await;
        let root = scratch_root();
        TEST_ROOT.with(|r| *r.borrow_mut() = Some(root.clone()));
        let thread = store::create_thread(&pool, Provider::Claude, None, None, None, "video")
            .await
            .unwrap();
        let run = send(
            &pool,
            thread,
            json!({"studioStyle":{"theme":null,"format":"video","lengthSecs":90}}),
        )
        .await;
        let meta: String = sqlx::query_scalar("SELECT meta FROM harness_items WHERE id = ?1")
            .bind(run.item_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(meta.contains("\"lengthSecs\":90"), "{meta}");

        make(&root, "minimax");
        let owner = store::Owner {
            run_id: run.run_id,
            attempt_id: run.attempt_id,
            entity: "weak:1".into(),
        };
        let started = HarnessEvent::ToolStarted {
            id: "call-1".into(),
            kind: ToolKind::Bash,
            name: "Bash".into(),
            title: "oculus studio new minimax".into(),
            input: json!({"command":"oculus studio new minimax"}),
        };
        store::apply(&pool, thread, &started, Some(&owner))
            .await
            .unwrap();
        let finished = HarnessEvent::ToolFinished {
            id: "call-1".into(),
            ok: true,
            output: format!("made {}", root.join("minimax").display()),
            title: None,
        };
        store::apply(&pool, thread, &finished, Some(&owner))
            .await
            .unwrap();
        TEST_ROOT.with(|r| *r.borrow_mut() = None);
        assert_eq!(
            link_of(&pool, thread).await,
            Some(("minimax".into(), Some(90)))
        );
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn a_thread_keeps_its_first_video_until_its_folder_is_gone() {
        let pool = pool().await;
        let root = scratch_root();
        let thread = store::create_thread(&pool, Provider::Claude, None, None, None, "video")
            .await
            .unwrap();
        let other = store::create_thread(&pool, Provider::Claude, None, None, None, "again")
            .await
            .unwrap();
        let run = send(&pool, thread, json!({})).await;
        let item = tool(&pool, thread, &run).await;
        for slug in ["first", "scratch"] {
            make(&root, slug);
        }
        for slug in ["first", "scratch", "first"] {
            created(
                &pool,
                thread,
                item,
                &format!("oculus studio new {slug}"),
                &root.join(slug),
                &root,
            )
            .await;
        }
        assert_eq!(link_of(&pool, thread).await, Some(("first".into(), None)));

        // The linked folder is deleted: the thread may link the next one.
        std::fs::remove_dir_all(root.join("first")).unwrap();
        make(&root, "second");
        created(
            &pool,
            thread,
            item,
            "oculus studio new second",
            &root.join("second"),
            &root,
        )
        .await;
        assert_eq!(link_of(&pool, thread).await, Some(("second".into(), None)));

        // A deleted video's row gives its slug to the folder made again.
        sqlx::query("INSERT INTO studio_videos (slug, thread_id) VALUES ('gone', NULL)")
            .execute(&pool)
            .await
            .unwrap();
        make(&root, "gone");
        created(
            &pool,
            other,
            item,
            "oculus studio new gone",
            &root.join("gone"),
            &root,
        )
        .await;
        assert_eq!(link_of(&pool, other).await, Some(("gone".into(), None)));

        let asked = |s: &str| vec![s.to_owned()];
        assert!(printed_slug("made /tmp/elsewhere", &root, &asked("elsewhere")).is_none());
        let up = format!("made {}/../first", root.display());
        assert!(printed_slug(&up, &root, &asked("first")).is_none());
        let json = json!({"dir":root.join("second")}).to_string();
        assert_eq!(
            printed_slug(&json, &root, &asked("second")).as_deref(),
            Some("second")
        );
        // One video asked for and one made: linked whatever the spelling.
        assert_eq!(
            printed_slug(&json, &root, &asked("")).as_deref(),
            Some("second")
        );
        // Of two made, only the one the command named.
        let two = format!(
            "made {}\nmade {}",
            root.join("first").display(),
            root.join("second").display()
        );
        assert!(printed_slug(&two, &root, &["gone".into(), "x".into()]).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn a_line_making_a_scratch_video_then_a_real_one_links_the_real_one() {
        let pool = pool().await;
        let root = scratch_root();
        let thread = store::create_thread(&pool, Provider::Claude, None, None, None, "video")
            .await
            .unwrap();
        let run = send(&pool, thread, json!({})).await;
        let item = tool(&pool, thread, &run).await;
        make(&root, "tmp");
        make(&root, "real");
        let mut conn = pool.acquire().await.unwrap();
        link_created(
            &mut conn,
            thread,
            item,
            "Bash",
            &json!({"command":"oculus studio new tmp --scratch && oculus studio new real"}),
            &format!(
                "made {}\nmade {}",
                root.join("tmp").display(),
                root.join("real").display()
            ),
            &root,
        )
        .await
        .unwrap();
        drop(conn);
        assert_eq!(link_of(&pool, thread).await, Some(("real".into(), None)));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn scratch_videos_are_never_linked() {
        let pool = pool().await;
        let root = scratch_root();
        let thread = store::create_thread(&pool, Provider::Claude, None, None, None, "change")
            .await
            .unwrap();
        let run = send(&pool, thread, json!({"libraryChange": true})).await;
        let item = tool(&pool, thread, &run).await;
        make(&root, "scratch");
        created(
            &pool,
            thread,
            item,
            "oculus studio new scratch",
            &root.join("scratch"),
            &root,
        )
        .await;
        assert_eq!(
            link_of(&pool, thread).await,
            None,
            "an Ask for a change turn"
        );

        // A later turn in that thread asking for a real video links it.
        let later = send(&pool, thread, json!({})).await;
        let item = tool(&pool, thread, &later).await;
        make(&root, "real");
        created(
            &pool,
            thread,
            item,
            "oculus studio new real",
            &root.join("real"),
            &root,
        )
        .await;
        assert_eq!(link_of(&pool, thread).await, Some(("real".into(), None)));

        let plain = store::create_thread(&pool, Provider::Claude, None, None, None, "chat")
            .await
            .unwrap();
        let run = send(&pool, plain, json!({})).await;
        let item = tool(&pool, plain, &run).await;
        make(&root, "card");
        created(
            &pool,
            plain,
            item,
            "oculus studio new card --scratch",
            &root.join("card"),
            &root,
        )
        .await;
        assert_eq!(link_of(&pool, plain).await, None, "`--scratch`");
        std::fs::remove_dir_all(root).unwrap();
    }
}
