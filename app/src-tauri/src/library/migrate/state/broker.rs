//! The credential broker around the move. keyd reads the vault by path on
//! every request and takes a missing file for an empty vault, and the OS
//! registration names the old socket, so keyd is unloaded before the vault
//! moves and registered again at the new paths after.

use std::path::Path;

/// The seam the tests fake: the real one talks to launchd (or stops the
/// resident broker on Windows), which no test may do.
pub trait Broker: Sync {
    /// Unloads keyd and removes its registration.
    fn stop(&self, data_dir: &Path) -> Result<(), String>;
    /// Registers the keyd this build ships, where it ships one.
    fn start(&self, data_dir: &Path) -> Result<(), String>;
}

/// The OS registration, through `keyd_core`'s registrar.
pub struct Registered;

impl Broker for Registered {
    fn stop(&self, _data_dir: &Path) -> Result<(), String> {
        keyd_core::platform::registrar()
            .uninstall()
            .map(|_| ())
            .map_err(|e| {
                format!(
                    "could not stop Oculus's credential helper before moving its vault: {e}. \
                     Open Oculus to finish the update"
                )
            })
    }

    /// The installed app registers its bundled keyd. A binary that ships
    /// none says once who will.
    fn start(&self, data_dir: &Path) -> Result<(), String> {
        let exe = std::env::current_exe().unwrap_or_default();
        if let Some(line) = unregistered(&exe, cfg!(debug_assertions)) {
            elog!("[oculus] state move: {line}");
            return Ok(());
        }
        crate::auth::keyd::ensure_installed_in(data_dir)
    }
}

/// Why the binary at `exe` registers no keyd after a move, and what will:
/// one with no bundled keyd beside it (a build tree's, debug or release),
/// and a macOS debug build, whose keyd the dev preflight installs.
pub(super) fn unregistered(exe: &Path, debug_build: bool) -> Option<String> {
    let ships = keyd_core::paths::bundled_program(exe).is_some_and(|p| p.is_file());
    if ships && !(debug_build && !cfg!(windows)) {
        return None;
    }
    Some(
        "keyd is not registered at its new paths: this binary ships none. The next launch \
         of the installed Oculus app registers it; in development, the main checkout's \
         `bun run tauri dev` (its `oculus keyd install`)"
            .to_string(),
    )
}
