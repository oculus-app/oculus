use sqlx::{Row, SqlitePool};

use crate::sync::Course;

/// The `subjects` row every file at the data dir's top level hangs off
/// (`kind = 'top'`, code `layout::TOP_LEVEL_CODE`), inserted by migration 68.
/// It is no subject: negative, so no Canvas course id meets it, and not `-1`,
/// which the revision topics' indexes use for "no subject".
pub const TOP_LEVEL_SUBJECT_ID: i64 = -100;

/// The reserved row's id, read rather than assumed, so a database without
/// the row gives `None` instead of rows that hang off nothing.
pub async fn top_level_id(pool: &SqlitePool) -> Result<Option<i64>, sqlx::Error> {
    sqlx::query_scalar("SELECT id FROM subjects WHERE kind = 'top'")
        .fetch_optional(pool)
        .await
}

#[derive(Debug, Clone)]
pub struct SubjectRow {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub term_name: Option<String>,
    pub is_current: bool,
    pub selected: bool,
    pub last_synced_at: Option<String>,
}

pub async fn upsert_subjects(pool: &SqlitePool, courses: &[Course]) -> Result<(), String> {
    for c in courses {
        sqlx::query(
            r#"INSERT INTO subjects (id, code, name, term_name, term_sort, is_current, workflow_state, selected)
               VALUES (?1, ?2, ?3, ?4, ?7, ?5, ?6, 1)
               ON CONFLICT(id) DO UPDATE SET
                 name           = excluded.name,
                 term_name      = excluded.term_name,
                 term_sort      = excluded.term_sort,
                 is_current     = excluded.is_current,
                 workflow_state = excluded.workflow_state"#,
        )
        .bind(c.id)
        .bind(&c.code)
        .bind(&c.name)
        .bind(&c.term)
        .bind(i32::from(c.is_current))
        .bind(&c.workflow_state)
        .bind(&c.term_sort)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Give a sort key to rows no course fetch has stamped since the column was
/// added, read from the term name alone: only a fetch has `start_at`, and the
/// next one overwrites these. Returns how many rows got one.
pub async fn backfill_term_sort(pool: &SqlitePool, southern: bool) -> Result<usize, String> {
    let rows: Vec<(i64, String)> = sqlx::query_as(
        "SELECT id, term_name FROM subjects
         WHERE kind = 'subject' AND term_sort IS NULL AND term_name IS NOT NULL",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let mut filled = 0;
    for (id, name) in rows {
        let Some(sort) = crate::sync::terms::term_sort(&name, None, southern) else {
            continue;
        };
        sqlx::query("UPDATE subjects SET term_sort = ?1 WHERE id = ?2 AND term_sort IS NULL")
            .bind(sort)
            .bind(id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
        filled += 1;
    }
    Ok(filled)
}

/// Every subject. The reserved top-level row is never one of them.
pub async fn subjects(pool: &SqlitePool) -> Result<Vec<SubjectRow>, String> {
    // Derived, not stored: the latest completed run naming the subject. Mirrors
    // `getSubjects` in app/src/lib/db/subjects.ts — keep the two in step.
    let rows = sqlx::query(
        "SELECT s.id, s.code, s.name, s.term_name, s.is_current, s.selected,
                (SELECT MAX(r.finished_at)
                 FROM sync_runs r, json_each(r.subject_codes) j
                 WHERE r.status = 'completed' AND j.value = s.code) AS last_synced_at
         FROM subjects s
         WHERE s.kind = 'subject'
         ORDER BY s.is_current DESC, s.term_sort IS NULL, s.term_sort DESC, s.name ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .iter()
        .map(|r| SubjectRow {
            id: r.get("id"),
            code: r.get("code"),
            name: r.get("name"),
            term_name: r.get("term_name"),
            is_current: r.get::<i64, _>("is_current") != 0,
            selected: r.get::<i64, _>("selected") != 0,
            last_synced_at: r.get("last_synced_at"),
        })
        .collect())
}
