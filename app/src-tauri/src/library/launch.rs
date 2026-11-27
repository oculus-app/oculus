//! What the app and the CLI do before anything else opens a file in the
//! data dir, in this order: the app's own state moves into its state folder
//! (`migrate::state`), Start over's cleanup finishes, and an old library
//! moves into the Drive tree (`migrate`).

use std::path::Path;

/// `Err` means the library is not in this build's layout: the caller must
/// stop before it opens the database, a window or keyd.
pub fn at_launch(data_dir: &Path) -> Result<(), String> {
    super::migrate::state::at_startup(data_dir)?;
    super::storage::finish_start_over(data_dir);
    super::migrate::at_startup(data_dir)
}
