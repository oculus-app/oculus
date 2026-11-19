//! Locating an executable: override, PATH, well-known dirs, login shell.

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use super::{binary_name, override_env};
use crate::harness::event::Provider;
use crate::runtime::platform::find::find_executable;
pub use crate::runtime::platform::find::tool;
pub(super) use crate::runtime::platform::find::{
    home, is_executable, search_path_env, well_known_dirs,
};

fn locate(provider: Provider) -> Result<PathBuf, String> {
    #[cfg(windows)]
    if provider == Provider::Claude {
        return Err(
            "Claude Code is unavailable on Windows: its native sandbox is not supported".into(),
        );
    }
    let name = binary_name(provider);
    if let Some(p) = std::env::var_os(override_env(provider)) {
        let p = PathBuf::from(p);
        return if is_executable(&p) {
            Ok(p)
        } else {
            Err(format!(
                "{} points at {}, which is not an executable",
                override_env(provider),
                p.display()
            ))
        };
    }
    if let Some(p) = find_executable(name) {
        return Ok(p);
    }
    Err(format!(
        "`{name}` is not installed, or not on PATH — set {} to its full path",
        override_env(provider)
    ))
}

fn cache() -> &'static Mutex<std::collections::HashMap<Provider, Result<PathBuf, String>>> {
    static CACHE: OnceLock<Mutex<std::collections::HashMap<Provider, Result<PathBuf, String>>>> =
        OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// The provider's binary, or why not. A miss is cached too, so a missing CLI
/// does not re-probe a login shell on every send; [`forget`] clears it.
pub fn binary(provider: Provider) -> Result<PathBuf, String> {
    let mut c = cache().lock().unwrap();
    c.entry(provider)
        .or_insert_with(|| locate(provider))
        .clone()
}

/// Drop cached lookups, health and newest versions, for a recheck after an
/// install.
pub fn forget() {
    cache().lock().unwrap().clear();
    super::health::health_cache().lock().unwrap().clear();
    crate::runtime::platform::find::forget();
    crate::harness::cli::update::forget();
}
