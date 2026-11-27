use std::path::{Path, PathBuf};

/// `<data dir>/.oculus/studio`: Studio's videos, series outlines and component and theme
/// libraries (docs/studio.md). It holds no secrets.
pub fn studio_dir(data_dir: &Path) -> PathBuf {
    super::state_dir(data_dir).join("studio")
}

/// The outlines alongside a Studio videos root, including in a scratch library.
pub fn studio_series_dir(videos: &Path) -> PathBuf {
    videos.with_file_name("series")
}

/// The data-dir folders an agent thread may write whole outside its
/// `agents/` cwd, beside the database's files (`db_write_paths`) and the
/// subjects' own files (`harness::protected`). Each harness renders this
/// list into its own grant (docs/harness.md); the manager creates them
/// first, since Codex fails a turn on a writable root it cannot stat.
pub fn agent_write_dirs(data_dir: &Path) -> Vec<PathBuf> {
    vec![studio_dir(data_dir)]
}
