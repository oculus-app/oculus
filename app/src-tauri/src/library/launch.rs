//! What the app and the CLI do before anything else opens a file in the
//! data dir, in this order: the app's own state moves into its state folder
//! (`migrate::state`), Start over's cleanup finishes, an old library moves
//! into the Drive tree (`migrate`), and files loose in `courses/` move up to
//! the top (`migrate::loose`). Last, `courses/` is made if it is missing.

use std::path::Path;

/// `Err` means the library is not in this build's layout: the caller must
/// stop before it opens the database, a window or keyd.
pub fn at_launch(data_dir: &Path) -> Result<(), String> {
    super::migrate::state::at_startup(data_dir)?;
    super::storage::finish_start_over(data_dir);
    super::migrate::at_startup(data_dir)?;
    super::migrate::loose::at_startup(data_dir);
    // Drive's top level shows the folder of subjects before the first sync.
    let courses = super::layout::courses_dir(data_dir);
    std::fs::create_dir_all(&courses).map_err(|e| format!("create {}: {e}", courses.display()))
}
