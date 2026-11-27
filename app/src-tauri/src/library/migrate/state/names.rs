//! What the move takes: a fixed list of the names the app itself wrote at
//! the data dir's top, each to the same name inside the state folder.
//! Nothing is matched by pattern, so a folder or file the app did not make
//! (the student's, a developer's, `lectures/` from before the Drive tree)
//! stays where it is.

/// In the order they move. The database and the vault lead: they cannot be
/// rebuilt, so a later failure finds them already in place.
pub const MOVED: [&str; 26] = [
    "oculus.db",
    "oculus.db-wal",
    "oculus.db-shm",
    "vault.bin",
    "vault.bin.lock",
    // Windows' DPAPI-sealed master key, which opens the vault.
    "master-key.dpapi",
    "master-key.dpapi.lock",
    "canvas-session",
    "okta-sign-in.log",
    // Session files an earlier version kept, until keyd imports them.
    "canvas-session.cookie",
    "sso-session.cookie",
    "ed-session.token",
    "institution.json",
    "ed-courses.json",
    "file-manifest.json",
    "mineru-usage.json",
    "voyage-usage.json",
    "models",
    "studio",
    "whiteboard-pages",
    // The page pictures' name before the whiteboard rename, which follows.
    "canvas-pages",
    "recovery",
    "downloads",
    "tmp",
    "agents",
    // Start over's marker, honoured from its new place right after the move.
    "start-over",
];

/// The database's name at the top: the one step checked for other openers.
pub const DATABASE: &str = "oculus.db";

/// keyd's install folder at the top. Not moved: the OS registration names
/// the program inside it, so the new install writes its own under the state
/// folder and this one is removed after, by these names only.
pub const OLD_BIN: &str = "bin";
pub const OLD_BIN_ENTRIES: [&str; 5] = [
    "Oculus Helper.app",
    "oculus-keyd",
    "oculus-keyd.stamp",
    "keyd-program",
    "keyd-lifecycle.lock",
];

/// The socket launchd made at the top for the registration the move removes.
pub const OLD_SOCKET: &str = "keyd.sock";

/// Chat history, saved tabs and undo snapshots name these folders by their
/// old data-dir-relative paths; a `path_moves` row each keeps them readable.
pub const CITED: [&str; 3] = ["agents", "studio", "whiteboard-pages"];
