//! Finding an executable from inside a GUI app, for the provider CLIs
//! (`harness::cli::discover`) and other tools (`brew`, `soffice`, `node.exe`):
//! PATH, the installers' usual dirs, then a login shell. Results are cached for
//! the process.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

pub fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

/// Where the installers put things, in the order worth trying.
pub fn well_known_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(h) = home() {
        dirs.push(h.join(".local/bin"));
        dirs.push(h.join(".claude/local"));
        dirs.push(h.join(".opencode/bin"));
        dirs.push(h.join(".bun/bin"));
        dirs.push(h.join(".npm-global/bin"));
        dirs.push(h.join(".volta/bin"));
        dirs.push(h.join(".cargo/bin"));
        // nvm keeps one bin dir per node version; take any that has it.
        if let Ok(rd) = std::fs::read_dir(h.join(".nvm/versions/node")) {
            for e in rd.flatten() {
                dirs.push(e.path().join("bin"));
            }
        }
    }
    #[cfg(windows)]
    {
        if let Some(roaming) = std::env::var_os("APPDATA") {
            dirs.push(PathBuf::from(roaming).join("npm"));
        }
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join("Programs"));
        }
        if let Some(programs) = std::env::var_os("ProgramFiles") {
            dirs.push(PathBuf::from(programs).join("nodejs"));
        }
    }
    #[cfg(not(windows))]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
    }
    dirs
}

pub fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(p)
            .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
            .unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

pub fn search_path_env(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let dirs: Vec<_> = std::env::split_paths(&path).collect();
    search_dirs(name, &dirs)
}

/// Ask a login shell, which has the PATH a terminal would. Slow, so it is the
/// last step and cached.
#[cfg(not(windows))]
fn ask_login_shell(name: &str) -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    let out = crate::runtime::platform::command(shell)
        .args(["-lc", &format!("command -v {name}")])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let p = PathBuf::from(s);
    is_executable(&p).then_some(p)
}

/// The same lookup order for provider CLIs and installer tools.
pub fn find_executable(name: &str) -> Option<PathBuf> {
    let found = search_path_env(name).or_else(|| search_dirs(name, &well_known_dirs()));
    #[cfg(not(windows))]
    let found = found.or_else(|| ask_login_shell(name));
    found
}

fn tool_cache() -> &'static Mutex<std::collections::HashMap<String, Option<PathBuf>>> {
    static CACHE: OnceLock<Mutex<std::collections::HashMap<String, Option<PathBuf>>>> =
        OnceLock::new();
    CACHE.get_or_init(Default::default)
}

/// Where some other tool (`brew`, `npm`, …) is, by the same steps as the
/// provider CLIs (`harness::cli::discover::binary`), cached. The login shell
/// matters for `brew`, whose dir launchd's PATH lacks.
pub fn tool(name: &str) -> Option<PathBuf> {
    if let Some(hit) = tool_cache().lock().unwrap().get(name) {
        return hit.clone();
    }
    let found = find_executable(name);
    tool_cache()
        .lock()
        .unwrap()
        .insert(name.to_string(), found.clone());
    found
}

/// Drop the cached tool lookups, for a recheck after an install.
pub fn forget() {
    tool_cache().lock().unwrap().clear();
}

fn search_dirs(name: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    #[cfg(windows)]
    let names = executable_names(name, std::env::var("PATHEXT").ok().as_deref());
    #[cfg(not(windows))]
    let names = [name.to_owned()];
    // Prefer a native executable even when an earlier PATH directory has a shim.
    names
        .iter()
        .flat_map(|name| dirs.iter().map(move |dir| dir.join(name)))
        .find(|path| is_executable(path))
}

#[cfg(any(windows, test))]
fn executable_names(name: &str, pathext: Option<&str>) -> Vec<String> {
    if Path::new(name).extension().is_some() {
        return vec![name.to_owned()];
    }
    let mut extensions = vec![".exe".to_owned()];
    for extension in pathext.unwrap_or(".EXE;.CMD;.BAT").split(';') {
        let extension = extension.to_ascii_lowercase();
        if matches!(extension.as_str(), ".exe" | ".cmd" | ".bat")
            && !extensions.contains(&extension)
        {
            extensions.push(extension);
        }
    }
    for extension in [".cmd", ".bat"] {
        if !extensions.iter().any(|s| s == extension) {
            extensions.push(extension.into());
        }
    }
    extensions
        .into_iter()
        .map(|extension| format!("{name}{extension}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_executables_precede_batch_shims() {
        assert_eq!(
            executable_names("codex", Some(".BAT;.CMD;.EXE")),
            ["codex.exe", "codex.bat", "codex.cmd"]
        );
        assert_eq!(executable_names("codex.exe", None), ["codex.exe"]);
        assert_eq!(
            executable_names("node", Some(".PS1;.EXE")),
            ["node.exe", "node.cmd", "node.bat"]
        );
    }
}
