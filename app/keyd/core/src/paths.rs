//! Where keyd's files live. The data dir is defined here once, and both keyd
//! and the app's `paths::data_dir` use it, as is the hidden state folder at
//! its top that holds everything of the app's own. What sits in it is named
//! here too; where the OS keeps its own registration is the registrar's
//! business.

use std::path::{Path, PathBuf};

/// The app's bundle identifier (`identifier` in tauri.conf.json; the app's
/// tests hold the two together).
pub const IDENTIFIER: &str = "com.tchan.oculus";

/// The name cargo builds keyd under, and of the bare binary an earlier
/// install left in `bin/`.
pub const BINARY: &str = "oculus-keyd";

/// The helper app keyd runs as, and its executable's name inside it: the
/// name macOS shows for keyd in a keychain prompt, the background-activity
/// notice and Login Items, which some read from the executable rather than the
/// bundle. Its bundle identifier is `<IDENTIFIER>.keyd`.
pub const HELPER: &str = "Oculus Helper";

const STAMP: &str = "oculus-keyd.stamp";

/// The OS's per-user data dir plus the identifier: Tauri's `app_data_dir()`.
pub fn data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        return dirs::home_dir()
            .expect("Windows user profile directory is unavailable")
            .join("Oculus");
    }
    #[cfg(not(windows))]
    dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(IDENTIFIER)
}

/// The hidden folder at the data dir's top that holds the app's own state
/// (docs/architecture.md, "The data directory"). The rest of the top level
/// is the library.
pub const STATE_DIR: &str = ".oculus";

pub fn state_dir(data_dir: &Path) -> PathBuf {
    data_dir.join(STATE_DIR)
}

/// The state folder, created when missing and hidden from Explorer on
/// Windows, where the data dir is a folder the student browses.
pub fn ensure_state_dir(data_dir: &Path) -> std::io::Result<PathBuf> {
    let dir = state_dir(data_dir);
    std::fs::create_dir_all(&dir)?;
    #[cfg(windows)]
    crate::platform::files::hide(&dir)?;
    Ok(dir)
}

/// What a unix `sun_path` holds, NUL included (macOS; Linux has 108).
pub const SUN_PATH: usize = 104;

/// The socket's name at the data dir's top, used when the state folder's
/// would not fit `sun_path`.
const SHALLOW_SOCKET: &str = ".keyd.sock";

/// keyd's endpoint: `.oculus/keyd.sock`, or `.keyd.sock` at the top when the
/// data dir is too deep for that to fit a `sun_path`. keyd, the registrar and
/// the client all ask here, so they agree.
pub fn socket(data_dir: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        let mut endpoint = crate::platform::pipe_name().expect("Windows user SID is unavailable");
        if data_dir != self::data_dir() {
            // Explicit non-production roots (test fixtures) must not share the
            // live user's endpoint or collide with each other.
            use std::hash::{Hash, Hasher};
            let mut hash = std::collections::hash_map::DefaultHasher::new();
            data_dir.hash(&mut hash);
            let mut name = endpoint.into_os_string();
            name.push(format!(".test.{:x}", hash.finish()));
            endpoint = name.into();
        }
        return endpoint;
    }
    #[cfg(not(windows))]
    {
        let inside = state_dir(data_dir).join("keyd.sock");
        if inside.as_os_str().len() < SUN_PATH {
            inside
        } else {
            data_dir.join(SHALLOW_SOCKET)
        }
    }
}

/// Every secret, sealed under the master key only keyd reads.
pub fn vault(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join(VAULT)
}

const VAULT: &str = "vault.bin";

/// Where the vault sat before the state folder: still there in a library the
/// launch move (`library::migrate::state` in the app) has not reached.
pub fn unmoved_vault(data_dir: &Path) -> PathBuf {
    data_dir.join(VAULT)
}

/// The lock the vault is read and replaced under, beside it.
pub fn vault_lock(vault_file: &Path) -> PathBuf {
    let mut name = vault_file.as_os_str().to_owned();
    name.push(".lock");
    PathBuf::from(name)
}

/// Where the Canvas session's files sit: the sign-in's attempt record and
/// its signed-out marker, and the app's authenticated flag.
pub fn session_dir(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("canvas-session")
}

/// The Canvas session cookie as an earlier version kept it, a bare
/// `name=value; …` header. keyd imports it once (`ops/legacy.rs`).
pub fn cookie(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("canvas-session.cookie")
}

/// Okta's cookies for the SSO host as an earlier version kept them, the same
/// bare header as the Canvas one.
pub fn sso_cookie(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("sso-session.cookie")
}

/// Ed's `x-token`, as an earlier version kept it. keyd imports it once.
pub fn ed_token(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("ed-session.token")
}

/// Present while a session Canvas has accepted is believed held. The app's
/// startup probe ignores the stored session without it.
pub fn authenticated(data_dir: &Path) -> PathBuf {
    session_dir(data_dir).join("authenticated")
}

/// Present from a sign-out until the next session. While it is, automatic
/// sign-ins stand down.
pub fn signed_out(data_dir: &Path) -> PathBuf {
    session_dir(data_dir).join("signed-out")
}

/// The attempt record every process checks before an automatic sign-in.
pub fn sign_in_record(data_dir: &Path) -> PathBuf {
    session_dir(data_dir).join("sign-in.json")
}

/// The lock `sign_in_record` is read and replaced under. A file of its own,
/// because a save replaces the record's inode and a lock on it would go with it.
pub fn sign_in_lock(data_dir: &Path) -> PathBuf {
    session_dir(data_dir).join("sign-in.json.lock")
}

/// Every headless Okta sign-in attempt, whoever made it.
pub fn sign_in_log(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("okta-sign-in.log")
}

/// Writes a session file readable by this user only.
pub fn write_private(path: &Path, body: &str) -> std::io::Result<()> {
    crate::platform::files::write_private(path, body.as_bytes())
}

/// Appends one sign-in attempt, stamped `now`, to the log.
pub fn append_sign_in_log(data_dir: &Path, message: &str, now: u64) {
    append_bounded_log(&sign_in_log(data_dir), message, now);
}

/// Appends one line stamped `now` (UTC), rewriting the file to its last 200
/// lines once it passes 64 KiB.
pub fn append_bounded_log(path: &Path, message: &str, now: u64) {
    use std::io::Write;

    let line = format!("{}Z {message}\n", crate::clock::iso8601_utc(now));

    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        f.write_all(line.as_bytes()).ok();
    }

    // Only rewrite once the file has grown past the cap.
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > 64 * 1024 {
            if let Ok(text) = std::fs::read_to_string(path) {
                let lines: Vec<&str> = text.lines().collect();
                let keep = lines[lines.len().saturating_sub(200)..].join("\n");
                std::fs::write(path, format!("{keep}\n")).ok();
            }
        }
    }
}

/// `<HELPER>.app`, the directory name of keyd's helper app.
pub fn helper_app_name() -> String {
    format!("{HELPER}.app")
}

/// keyd's executable inside the helper app `helper`.
pub fn helper_program(helper: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        return helper.join("oculus-keyd.exe");
    }
    #[cfg(not(windows))]
    helper.join("Contents/MacOS").join(HELPER)
}

/// The helper app `program` is the executable of, when it sits at
/// `<x>.app/Contents/MacOS/<HELPER>`.
pub fn helper_of(program: &Path) -> Option<PathBuf> {
    let macos = program.parent()?;
    let contents = macos.parent()?;
    let app = contents.parent()?;
    let shaped = program.file_name()? == HELPER
        && macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && app.extension()? == "app";
    shaped.then(|| app.to_path_buf())
}

/// The keyd an app bundle ships for `exe`, one of the bundle's
/// `Contents/MacOS` executables: its `Contents/Helpers/<HELPER>.app`.
pub fn bundled_program(exe: &Path) -> Option<PathBuf> {
    #[cfg(windows)]
    {
        return Some(exe.parent()?.join("oculus-keyd.exe"));
    }
    #[cfg(not(windows))]
    {
        let macos = exe.parent()?;
        let contents = macos.parent()?;
        let app = contents.parent()?;
        let shaped = macos.file_name()? == "MacOS"
            && contents.file_name()? == "Contents"
            && app.extension()? == "app";
        shaped.then(|| helper_program(&contents.join("Helpers").join(helper_app_name())))
    }
}

/// Where an install that does not run in place puts keyd's helper app, and
/// its stamp.
pub fn bin_dir(data_dir: &Path) -> PathBuf {
    state_dir(data_dir).join("bin")
}

pub fn installed_helper(data_dir: &Path) -> PathBuf {
    bin_dir(data_dir).join(helper_app_name())
}

pub fn installed_bin(data_dir: &Path) -> PathBuf {
    helper_program(&installed_helper(data_dir))
}

/// Where an install put keyd before it ran as a helper app: a bare binary,
/// removed by the next install.
pub fn bare_installed_bin(data_dir: &Path) -> PathBuf {
    bin_dir(data_dir).join(BINARY)
}

/// The source hash of the keyd the agent runs, written after a good install.
pub fn stamp(data_dir: &Path) -> PathBuf {
    bin_dir(data_dir).join(STAMP)
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn everything_sits_in_the_state_folder() {
        let d = Path::new("/d");
        assert_eq!(socket(d), Path::new("/d/.oculus/keyd.sock"));
        assert_eq!(vault(d), Path::new("/d/.oculus/vault.bin"));
        assert_eq!(
            vault_lock(&vault(d)),
            Path::new("/d/.oculus/vault.bin.lock")
        );
        assert_eq!(session_dir(d), Path::new("/d/.oculus/canvas-session"));
        assert_eq!(sign_in_log(d), Path::new("/d/.oculus/okta-sign-in.log"));
        assert_eq!(
            installed_bin(d),
            Path::new("/d/.oculus/bin/Oculus Helper.app/Contents/MacOS/Oculus Helper")
        );
        assert_eq!(
            bare_installed_bin(d),
            Path::new("/d/.oculus/bin/oculus-keyd")
        );
        assert_eq!(stamp(d), Path::new("/d/.oculus/bin/oculus-keyd.stamp"));
        assert_eq!(unmoved_vault(d), Path::new("/d/vault.bin"));
        assert!(data_dir().ends_with(IDENTIFIER));
    }

    /// `/Users/<name>` plus the macOS data dir: the longest name whose socket
    /// still fits inside the state folder is 33 bytes; one more falls back.
    #[test]
    fn a_socket_too_long_for_the_state_folder_sits_at_the_top() {
        let data = |name: usize| {
            PathBuf::from(format!("/Users/{}", "u".repeat(name)))
                .join("Library/Application Support")
                .join(IDENTIFIER)
        };
        let fits = data(33);
        assert_eq!(socket(&fits), fits.join(".oculus/keyd.sock"));
        assert_eq!(socket(&fits).as_os_str().len(), SUN_PATH - 1);

        let deep = data(34);
        assert_eq!(socket(&deep), deep.join(".keyd.sock"));
        assert!(socket(&deep).as_os_str().len() < SUN_PATH);

        // Past the shallow name's own limit nothing fits; the registrar refuses it.
        let deepest = data(41);
        assert_eq!(socket(&deepest), deepest.join(".keyd.sock"));
        assert_eq!(socket(&deepest).as_os_str().len(), SUN_PATH);
    }

    #[test]
    fn keyd_is_the_executable_of_its_helper_app() {
        let helper = Path::new("/d/bin/Oculus Helper.app");
        assert_eq!(helper_of(&helper_program(helper)).as_deref(), Some(helper));
        assert_eq!(helper_of(Path::new("/d/bin/oculus-keyd")), None);
        assert_eq!(
            helper_of(Path::new("/d/X.app/Contents/MacOS/other")),
            None,
            "another executable is not keyd"
        );
        assert_eq!(
            helper_of(Path::new("/d/X/Contents/MacOS/Oculus Helper")),
            None
        );
    }

    #[test]
    fn a_bundle_ships_keyd_as_a_nested_helper() {
        assert_eq!(
            bundled_program(Path::new("/A/Oculus.app/Contents/MacOS/app")).unwrap(),
            Path::new(
                "/A/Oculus.app/Contents/Helpers/Oculus Helper.app/Contents/MacOS/Oculus Helper"
            )
        );
        assert_eq!(bundled_program(Path::new("/x/target/release/oculus")), None);
        assert_eq!(bundled_program(Path::new("/x/Contents/MacOS/oculus")), None);
    }
}
