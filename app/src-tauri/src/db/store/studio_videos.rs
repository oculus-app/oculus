//! `studio_videos`: which harness thread makes each Studio video, and the
//! length it was asked for. The folder under `<data>/studio/videos/` is the
//! video; a row here only links it to its thread. Rows are written where a
//! thread's `oculus studio new` completes (`harness::store::studio`).

use std::collections::HashMap;

use sqlx::{Row, SqlitePool};

/// What a video's thread was started with.
#[derive(Debug, Clone, PartialEq)]
pub struct StudioLink {
    pub slug: String,
    pub thread_id: Option<i64>,
    /// The narration length the student asked for, in seconds.
    pub length_secs: Option<i64>,
}

/// The video a thread makes, if it makes one.
pub async fn studio_link_of_thread(
    pool: &SqlitePool,
    thread_id: i64,
) -> Result<Option<StudioLink>, String> {
    let row =
        sqlx::query("SELECT slug, thread_id, length_secs FROM studio_videos WHERE thread_id = ?1")
            .bind(thread_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;
    Ok(row.map(link))
}

/// Every link, by slug.
pub async fn studio_links(pool: &SqlitePool) -> Result<HashMap<String, StudioLink>, String> {
    let rows = sqlx::query("SELECT slug, thread_id, length_secs FROM studio_videos")
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(link)
        .map(|l| (l.slug.clone(), l))
        .collect())
}

fn link(r: sqlx::sqlite::SqliteRow) -> StudioLink {
    StudioLink {
        slug: r.get("slug"),
        thread_id: r.get("thread_id"),
        length_secs: r.get("length_secs"),
    }
}
