//! `studio_exports`: the Drive file a video's Final or Small render was saved
//! to, by `files.id`, so a re-render replaces it wherever the student has
//! moved or renamed it. Written by `studio::export`. A link goes with its
//! file, by the cascade and by hand beside it (docs/architecture.md, "The
//! database has one schema owner and two writers").

use sqlx::{Row, SqliteExecutor, SqlitePool};

/// A preset's Drive file as its row has it now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StudioExport {
    pub preset: String,
    pub file_id: i64,
    /// Data-dir-relative.
    pub relative_path: String,
    /// The file as the export last wrote it.
    pub written: Written,
}

/// What an export wrote: the mp4's size and modification time, and whether
/// it wrote the captions beside it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Written {
    pub size: i64,
    pub modified_ms: i64,
    pub captions: bool,
}

/// Every link of the video `slug` whose file still has a row.
pub async fn studio_exports_of(pool: &SqlitePool, slug: &str) -> Result<Vec<StudioExport>, String> {
    let rows = sqlx::query(
        "SELECT e.preset, e.file_id, f.relative_path, e.size, e.modified_ms, e.captions
         FROM studio_exports e
         JOIN files f ON f.id = e.file_id WHERE e.slug = ?1",
    )
    .bind(slug)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| StudioExport {
            preset: r.get("preset"),
            file_id: r.get("file_id"),
            relative_path: r.get("relative_path"),
            written: Written {
                size: r.get("size"),
                modified_ms: r.get("modified_ms"),
                captions: r.get::<i64, _>("captions") != 0,
            },
        })
        .collect())
}

/// Link `slug`'s `preset` to the file `file_id` as the export `written` it,
/// replacing an older link.
pub async fn set_studio_export<'e>(
    executor: impl SqliteExecutor<'e>,
    slug: &str,
    preset: &str,
    file_id: i64,
    written: Written,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO studio_exports (slug, preset, file_id, size, modified_ms, captions)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(slug, preset) DO UPDATE SET file_id = excluded.file_id,
           size = excluded.size, modified_ms = excluded.modified_ms,
           captions = excluded.captions",
    )
    .bind(slug)
    .bind(preset)
    .bind(file_id)
    .bind(written.size)
    .bind(written.modified_ms)
    .bind(written.captions)
    .execute(executor)
    .await
    .map(|_| ())
    .map_err(|e| format!("Could not remember where the {preset} render went: {e}"))
}

/// Forget every link of a deleted video; its Drive files stay.
pub async fn delete_studio_exports<'e>(
    executor: impl SqliteExecutor<'e>,
    slug: &str,
) -> Result<(), String> {
    sqlx::query("DELETE FROM studio_exports WHERE slug = ?1")
        .bind(slug)
        .execute(executor)
        .await
        .map(|_| ())
        .map_err(|e| format!("Could not forget the Drive files of video `{slug}`: {e}"))
}
