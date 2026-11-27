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

    /// A release registers its bundled keyd; a debug build leaves it to the
    /// dev preflight, which runs after this move.
    fn start(&self, data_dir: &Path) -> Result<(), String> {
        crate::auth::keyd::ensure_installed_in(data_dir)
    }
}
