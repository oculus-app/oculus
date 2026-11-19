//! The few calls `oculus-core` makes into the crates built on it: the agent
//! harness and the app shell. Core cannot name them, so `app_lib::bind_layers`
//! hands their functions over once, before the app or the CLI does anything
//! (docs/development.md#the-rust-crates).

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tauri::AppHandle;

/// Functions an upper crate defines and core calls.
pub struct Upper {
    /// `harness::app::shutdown`: end every CLI agent.
    pub stop_agents: fn(&AppHandle),
    /// `harness::write_opencode_config`.
    pub write_opencode_config: fn(&Path) -> Result<PathBuf, String>,
    /// `shell::browser::clear_sessions`: delete the university's cookies
    /// from the browser's jar, then run the callback.
    pub clear_browser_sessions: fn(&AppHandle, Box<dyn FnOnce() + Send>),
}

static UPPER: OnceLock<Upper> = OnceLock::new();

/// Called once per process by `app_lib::bind_layers`; a second call is ignored.
pub fn bind(upper: Upper) {
    let _ = UPPER.set(upper);
}

/// The bound functions. Panics when `bind` never ran: an entry point that
/// skips `app_lib::bind_layers` is a bug, not a state to run on in.
pub fn upper() -> &'static Upper {
    UPPER
        .get()
        .expect("app_lib::bind_layers was not called before core reached an upper crate")
}
