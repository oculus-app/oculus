//! `studio_exports`: the Drive file a video's Final or Small render was saved
//! to, by `files.id`, so a re-render replaces it wherever the student has
//! moved or renamed it. Written by `studio::export`. A link goes with its
//! file: `ON DELETE CASCADE`, and an explicit delete wherever `files` rows
//! are deleted, since a connection may lack `foreign_keys`.

use sqlx::{Row, SqliteExecutor, SqlitePool};

/// A preset's Drive file as its row has it now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StudioExport {
    pub preset: String,
    pub file_id: i64,
    /// Data-dir-relative.
    pub relative_path: String,
}

/// Every link of the video `slug` whose file still has a row.
pub async fn studio_exports_of(pool: &SqlitePool, slug: &str) -> Result<Vec<StudioExport>, String> {
    let rows = sqlx::query(
        "SELECT e.preset, e.file_id, f.relative_path FROM studio_exports e
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
        })
        .collect())
}

/// Link `slug`'s `preset` to the file `file_id`, replacing an older link.
pub async fn set_studio_export<'e>(
    executor: impl SqliteExecutor<'e>,
    slug: &str,
    preset: &str,
    file_id: i64,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO studio_exports (slug, preset, file_id) VALUES (?1, ?2, ?3)
         ON CONFLICT(slug, preset) DO UPDATE SET file_id = excluded.file_id",
    )
    .bind(slug)
    .bind(preset)
    .bind(file_id)
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
