//! A library as a build from before the state folder left it, in a scratch
//! data dir: the app's own files at the top beside `courses/`, the Drive
//! move's finished record, and the things at the top that are not the
//! app's. And a broker that only writes down what it was asked.

use std::path::Path;
use std::sync::Mutex;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;

use crate::library::migrate::state::{Broker, Env, Hooks};
use crate::test_support::{write_creating, Scratch};

pub const CODE: &str = "COMP1_2026";

/// What the move must leave where it is, besides `courses/` and the record.
pub const NOT_OURS: [&str; 6] = [
    ".DS_Store",
    ".claude",
    ".dictation-eval",
    ".trash-old",
    "lectures",
    "notes.txt",
];

pub fn block<T>(f: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(f)
}

pub fn file(dir: &Path, rel: &str, body: &str) {
    write_creating(dir.join(rel), body);
}

pub fn read(dir: &Path, rel: &str) -> String {
    std::fs::read_to_string(dir.join(rel)).unwrap_or_else(|e| panic!("{rel}: {e}"))
}

pub fn exists(dir: &Path, rel: &str) -> bool {
    std::fs::symlink_metadata(dir.join(rel)).is_ok()
}

/// The names at the data dir's top, sorted.
pub fn top(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .collect();
    names.sort();
    names
}

/// Every entry under `dir` with its kind: a link's target, a file's length.
/// The database's write-ahead files come and go with its connections.
pub fn snapshot(dir: &Path) -> Vec<String> {
    fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) {
        let mut entries: Vec<_> = std::fs::read_dir(dir).unwrap().flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let path = entry.path();
            let rel = crate::library::paths::slash_path(path.strip_prefix(root).unwrap());
            if rel.ends_with("-wal") || rel.ends_with("-shm") {
                continue;
            }
            let kind = entry.file_type().unwrap();
            if kind.is_symlink() {
                let target = std::fs::read_link(&path).unwrap();
                out.push(format!("{rel} -> {}", target.display()));
            } else if kind.is_dir() {
                out.push(format!("{rel}/"));
                walk(root, &path, out);
            } else {
                out.push(format!("{rel} ({})", entry.metadata().unwrap().len()));
            }
        }
    }
    let mut out = Vec::new();
    walk(dir, dir, &mut out);
    out
}

pub async fn open(database: &Path) -> SqlitePool {
    SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(database)
                .journal_mode(SqliteJournalMode::Wal)
                .create_if_missing(true),
        )
        .await
        .unwrap()
}

/// A database at the top with the app's schema, one setting and one rule
/// the Drive move kept.
async fn database(dir: &Path) {
    let pool = open(&dir.join("oculus.db")).await;
    crate::library::migrate::db::ensure(&pool).await.unwrap();
    sqlx::query("INSERT INTO settings (key, value) VALUES ('probe', 'kept')")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO path_moves (old_prefix, new_prefix)
         VALUES ('courses/COMP1_2026/files', 'courses/COMP1_2026/Course/Files')",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;
}

/// A new install's data dir is empty; this one has been used.
pub fn library(name: &str) -> Scratch {
    let dir = Scratch::new(name);
    let d: &Path = &dir;
    block(database(d));

    file(d, "vault.bin", "sealed");
    file(d, "vault.bin.lock", "");
    file(d, "canvas-session/authenticated", "");
    file(d, "canvas-session/sign-in.json", "{}");
    file(d, "okta-sign-in.log", "2026-11-01T00:00:00Z ok\n");
    for name in [
        "institution.json",
        "ed-courses.json",
        "file-manifest.json",
        "mineru-usage.json",
        "voyage-usage.json",
    ] {
        file(d, name, "{}");
    }
    file(d, "models/whisper/ggml-base.bin", "model");
    file(d, "studio/videos/bayes/video.json", "{}");
    file(d, "whiteboard-pages/7/pages.json", "{}");
    file(d, "recovery/whiteboards/7.json", "{}");
    std::fs::create_dir_all(d.join("downloads/.incoming")).unwrap();
    file(d, "agents/AGENTS.md", "stale");
    file(d, "agents/attachments/20261120-063301-0a1b2c3d.png", "png");
    file(d, &format!("agents/memories/{CODE}/MEMORY.md"), "# mine\n");

    // keyd's dev install and the socket launchd made for it.
    file(
        d,
        "bin/Oculus Helper.app/Contents/MacOS/Oculus Helper",
        "keyd",
    );
    file(d, "bin/oculus-keyd.stamp", "0000\n");
    #[cfg(unix)]
    drop(std::os::unix::net::UnixListener::bind(d.join("keyd.sock")).unwrap());

    let subject = format!("courses/{CODE}");
    file(d, &format!("{subject}/Course/Files/a.pdf"), "%PDF");
    file(d, &format!("{subject}/notes.md"), "# notes\n");
    std::fs::create_dir_all(d.join(format!("{subject}/.oculus/agents"))).unwrap();
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(
            "../../agents/AGENTS.md",
            d.join(format!("{subject}/AGENTS.md")),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            format!("../../../../agents/memories/{CODE}"),
            d.join(format!("{subject}/.oculus/agents/memories")),
        )
        .unwrap();
    }
    // A subject whose `AGENTS.md` is the student's own file.
    file(d, "courses/OWN_2026/AGENTS.md", "mine");
    file(d, "courses/loose.pdf", "%PDF");

    file(d, ".library-move/done", "drive");
    file(d, ".library-move/whiteboard", "done");
    file(
        d,
        ".library-move/journal.json",
        r#"{"format":1,"phase":"moved","steps":[],"rules":[],"notes":[],"renamed_records":[],"lectures":[],"relink":[],"left":[]}"#,
    );

    file(d, ".DS_Store", "");
    std::fs::create_dir_all(d.join(".claude/.cc-writes")).unwrap();
    file(d, ".dictation-eval/a.wav", "wav");
    file(d, ".trash-old/x", "x");
    file(d, "lectures/abc/video.mp4", "video");
    file(d, "notes.txt", "the student's");
    dir
}

/// Records each call with where the vault was when it came.
#[derive(Default)]
pub struct FakeBroker {
    pub calls: Mutex<Vec<String>>,
    pub refuse_stop: bool,
}

impl FakeBroker {
    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }

    fn record(&self, call: &str, data_dir: &Path) {
        let at_top = keyd_core::paths::unmoved_vault(data_dir).exists();
        let moved = keyd_core::paths::vault(data_dir).exists();
        self.calls
            .lock()
            .unwrap()
            .push(format!("{call} top={at_top} moved={moved}"));
    }
}

impl Broker for FakeBroker {
    fn stop(&self, data_dir: &Path) -> Result<(), String> {
        self.record("stop", data_dir);
        match self.refuse_stop {
            true => Err("launchd refused".into()),
            false => Ok(()),
        }
    }

    fn start(&self, data_dir: &Path) -> Result<(), String> {
        self.record("start", data_dir);
        Ok(())
    }
}

pub fn env(broker: &FakeBroker) -> Env<'_> {
    Env {
        allowed: true,
        broker,
        running: Vec::new,
        hooks: Hooks::default(),
    }
}
