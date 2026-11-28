//! Proof that no other process has the database open, before it moves.
//! SQLite's exclusive locking mode fails with "database is locked" while any
//! other connection merely has a WAL database open, idle included; a write
//! lock or a checkpoint would succeed against an idle app.

use std::path::Path;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteLockingMode};
use sqlx::{ConnectOptions, Connection};

/// What the student reads when something else has the library open.
pub const NOT_ALONE: &str = "Oculus or an `oculus` command is still using the library, so its \
     files were not moved. Quit Oculus, wait for any `oculus` command to finish, and open \
     Oculus again";

/// Opens `database` alone, folds its write-ahead log into it and closes it,
/// so one file moves. `Err(NOT_ALONE…)` when another connection holds it.
pub async fn checkpoint(database: &Path) -> Result<(), String> {
    let busy = |e: sqlx::Error| format!("{NOT_ALONE} ({}: {e})", database.display());
    // A short wait: the default 15 s would only delay the refusal.
    let options = SqliteConnectOptions::new()
        .filename(database)
        .create_if_missing(false)
        .locking_mode(SqliteLockingMode::Exclusive)
        .busy_timeout(Duration::from_millis(250));
    let mut conn = options.connect().await.map_err(busy)?;
    // The lock is taken by the first read, not by the pragma.
    let read = sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sqlite_master")
        .fetch_one(&mut conn)
        .await
        .map(|_| ());
    let folded = match read {
        Ok(()) => sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
            .execute(&mut conn)
            .await
            .map(|_| ()),
        Err(e) => Err(e),
    };
    conn.close().await.ok();
    folded.map_err(busy)
}
