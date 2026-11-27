use std::path::PathBuf;

/// The database as `tauri-plugin-sql` names it, relative to the data dir.
/// The plugin keys its migrations by this exact string, so the frontend's
/// `Database.load` (`app/src/lib/db/connection.ts`) spells it the same; a
/// repo test holds the two together.
pub const DB_URL: &str = "sqlite:.oculus/oculus.db";

pub fn db_path(data_dir: &std::path::Path) -> PathBuf {
    super::state_dir(data_dir).join("oculus.db")
}

/// The database plus the two files SQLite keeps beside it in WAL mode.
///
/// Writable to every harness sandbox, so `oculus project`/`task` can write:
/// SQLite needs the `-wal` and `-shm` files too, or it reports a readonly
/// database. Files, not their folder, which also holds the credential vault.
pub fn db_write_paths(data_dir: &std::path::Path) -> Vec<PathBuf> {
    let db = db_path(data_dir);
    let sidecar = |suffix: &str| {
        let mut p = db.clone().into_os_string();
        p.push(suffix);
        PathBuf::from(p)
    };
    vec![db.clone(), sidecar("-wal"), sidecar("-shm")]
}
