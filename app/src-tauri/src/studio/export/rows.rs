//! A first export (`create`) and a re-export over the linked file
//! (`replace`): the disk first, then the `files` rows and the link in one
//! transaction; when the rows can't be written, the new files go again. Rows
//! are what an imported file would get: `category_of_path` and the extension.

use sqlx::{SqliteConnection, SqlitePool};

use super::disk::{self, captions_of, Render};
use super::place::with_mp4;
use super::{Destination, DriveFile, Exported};
use crate::db::store::set_studio_export;
use crate::library::drive::ops::error::shown;
use crate::library::drive::ops::events::DriveChange;
use crate::library::drive::ops::rows::{delete_rows, file_type, home_id, name_of};
use crate::library::drive::ops::{guard, names};
use crate::library::layout;
use crate::studio::render::Preset;

fn db(e: sqlx::Error) -> String {
    format!("the database refused the export — {e}")
}

/// Copy the render into `to` under a free name, row it and link it.
pub async fn create(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    slug: &str,
    preset: Preset,
    render: &Render,
    to: &Destination,
) -> Result<Exported, String> {
    let target = guard::drive_target(data_dir, &to.target_dir).map_err(|e| e.message)?;
    let wanted = with_mp4(to.name.trim());
    names::check_name(&wanted, &target.rel).map_err(|e| e.message)?;
    let subject = home_id(pool, target.home())
        .await
        .map_err(|e| e.message)?
        .ok_or_else(|| format!("{} is in no subject Oculus knows", shown(&target.rel)))?;

    let folder = target.path.clone();
    let (mp4, captions) = (render.mp4.clone(), render.captions.clone());
    let (name, size, vtt_size) = crate::runtime::blocking::run(move || {
        let name = disk::free_name(&folder, &wanted);
        let path = folder.join(&name);
        let size = disk::place(&mp4, &path).map_err(|e| format!("Could not save {name}: {e}"))?;
        let vtt_size = match captions {
            Some(vtt) => match disk::place(&vtt, &folder.join(captions_of(&name))) {
                Ok(size) => Some(size),
                Err(e) => {
                    let _ = disk::remove(&path);
                    return Err(format!("Could not save the captions of {name}: {e}"));
                }
            },
            None => None,
        };
        Ok((name, size, vtt_size))
    })
    .await?;

    let rel = target.child_rel(&name);
    let vtt = vtt_size.map(|size| (captions_of(&rel), size));
    let written = async {
        let stale: Vec<(String, bool)> = std::iter::once(rel.clone())
            .chain(vtt.iter().map(|(r, _)| r.clone()))
            .map(|r| (r, false))
            .collect();
        delete_rows(pool, &stale).await.map_err(|e| e.message)?;
        let mut tx = pool.begin().await.map_err(db)?;
        let id = insert_row(&mut tx, subject, &rel, size).await?;
        if let Some((vtt_rel, size)) = &vtt {
            upsert_row(&mut tx, subject, vtt_rel, *size).await?;
        }
        set_studio_export(&mut *tx, slug, preset.name(), id).await?;
        tx.commit().await.map_err(db)?;
        Ok::<_, String>(id)
    }
    .await;
    let id = match written {
        Ok(id) => id,
        Err(e) => {
            let _ = disk::remove(&data_dir.join(&rel));
            if let Some((vtt_rel, _)) = &vtt {
                let _ = disk::remove(&data_dir.join(vtt_rel));
            }
            return Err(e);
        }
    };
    let captions = vtt.map(|(r, _)| r);
    Ok(Exported {
        path: data_dir.join(&rel),
        change: DriveChange {
            subject_ids: vec![subject],
            added: std::iter::once(rel.clone())
                .chain(captions.clone())
                .collect(),
            ..DriveChange::default()
        },
        file: DriveFile { file_id: id, rel },
        captions,
        replaced: false,
    })
}

/// Write the render over the linked `file` where it is now, under the name it
/// has now; its captions beside it, or removed when the video has none.
pub async fn replace(
    data_dir: &std::path::Path,
    pool: &SqlitePool,
    render: &Render,
    file: DriveFile,
) -> Result<Exported, String> {
    let subject = match layout::home_of(&file.rel) {
        Some(home) => home_id(pool, home).await.map_err(|e| e.message)?,
        None => None,
    }
    .ok_or_else(|| format!("{} is in no subject Oculus knows", shown(&file.rel)))?;
    let path = data_dir.join(&file.rel);
    let vtt_rel = captions_of(&file.rel);
    let vtt_path = data_dir.join(&vtt_rel);
    let (mp4, captions) = (render.mp4.clone(), render.captions.clone());
    let (to, vtt_to) = (path.clone(), vtt_path.clone());
    let name = shown(&file.rel).to_string();
    let (size, vtt) = crate::runtime::blocking::run(move || {
        let size = disk::place(&mp4, &to).map_err(|e| format!("Could not replace {name}: {e}"))?;
        let vtt = match captions {
            Some(vtt) => disk::place(&vtt, &vtt_to)
                .map(Captions::Written)
                .map_err(|e| format!("Could not replace the captions of {name}: {e}"))?,
            None => match disk::remove(&vtt_to) {
                Ok(true) => Captions::Removed,
                Ok(false) => Captions::None,
                Err(e) => return Err(format!("Could not remove the old captions of {name}: {e}")),
            },
        };
        Ok((size, vtt))
    })
    .await?;

    if let Captions::Removed = vtt {
        delete_rows(pool, &[(vtt_rel.clone(), false)])
            .await
            .map_err(|e| e.message)?;
    }
    let mut tx = pool.begin().await.map_err(db)?;
    sqlx::query("UPDATE files SET size_bytes = ?1, modified_at = datetime('now') WHERE id = ?2")
        .bind(size as i64)
        .bind(file.file_id)
        .execute(&mut *tx)
        .await
        .map_err(db)?;
    if let Captions::Written(size) = vtt {
        upsert_row(&mut tx, subject, &vtt_rel, size).await?;
    }
    tx.commit().await.map_err(db)?;

    let mut change = DriveChange {
        subject_ids: vec![subject],
        added: vec![file.rel.clone()],
        ..DriveChange::default()
    };
    let captions = match vtt {
        Captions::Written(_) => {
            change.added.push(vtt_rel.clone());
            Some(vtt_rel)
        }
        Captions::Removed => {
            change.removed.push(vtt_rel);
            None
        }
        Captions::None => None,
    };
    Ok(Exported {
        path,
        file,
        captions,
        replaced: true,
        change,
    })
}

/// What a re-export did to the captions beside the file.
enum Captions {
    Written(u64),
    Removed,
    None,
}

async fn insert_row(
    conn: &mut SqliteConnection,
    subject: i64,
    rel: &str,
    size: u64,
) -> Result<i64, String> {
    let name = name_of(rel);
    let done = sqlx::query(
        "INSERT INTO files (subject_id, filename, relative_path, file_type, size_bytes,
            category, first_seen_at, modified_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))",
    )
    .bind(subject)
    .bind(name)
    .bind(rel)
    .bind(file_type(name))
    .bind(size as i64)
    .bind(layout::category_of_path(rel))
    .execute(&mut *conn)
    .await
    .map_err(db)?;
    Ok(done.last_insert_rowid())
}

/// The captions' row: its size brought up to date, or a new row as reconcile
/// would make.
async fn upsert_row(
    conn: &mut SqliteConnection,
    subject: i64,
    rel: &str,
    size: u64,
) -> Result<(), String> {
    let updated = sqlx::query(
        "UPDATE files SET size_bytes = ?1, modified_at = datetime('now')
         WHERE subject_id = ?2 AND relative_path = ?3",
    )
    .bind(size as i64)
    .bind(subject)
    .bind(rel)
    .execute(&mut *conn)
    .await
    .map_err(db)?;
    if updated.rows_affected() == 0 {
        insert_row(conn, subject, rel, size).await?;
    }
    Ok(())
}
