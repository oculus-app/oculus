//! What a Claude thread may write at the data dir's top, kept current while
//! it runs. The launch reads the top level once and names the student's own
//! entries there: their folders as `--add-dir` (beside `courses/` and
//! Studio), every one in the sandbox's `allowWrite`. An entry made later (by the student in Drive, or by the
//! agent's file tool, which asks and is allowed by `requests::policy`) is
//! added with an `apply_flag_settings` control request, sent before the next
//! message and after each tool result, so the next command can write it.
//! The CLI keeps a granted path for the session: a request can add to
//! `allowWrite` but not take one away (measured on 2.1.332).

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::library::layout;

use super::settings::{sandbox_json, SandboxOpts};

/// The folders opened with `--add-dir`: the subjects' folder, the folders
/// an agent writes by design (`paths::agent_write_dirs`: Studio) and, of
/// `top` (the launch's one read of the top level), the folders, those that
/// exist (a library before its first sync has no `courses/`). Never the data
/// dir itself: that would make all of it writable to the sandbox, `.oculus/`
/// and every dot-name with it (the CLI grants an added folder's writes as
/// well as its reads).
pub(super) fn add_dirs(library: &Path, top: &[PathBuf]) -> Vec<PathBuf> {
    std::iter::once(layout::courses_dir(library))
        .chain(crate::library::paths::agent_write_dirs(library))
        .chain(top.iter().cloned())
        .filter(|p| p.is_dir())
        .collect()
}

/// The student's own entries at the top as the disk holds them now, less
/// symlinks, dot-names and the names the layout keeps (`layout::own_entries`).
pub(super) fn top_level(library: &Path) -> Vec<PathBuf> {
    layout::own_entries(library, layout::TOP_LEVEL_CODE)
}

/// The sandbox a live thread runs under, and the top-level entries in it.
pub(super) struct Grants {
    opts: SandboxOpts,
    granted: Vec<PathBuf>,
}

impl Grants {
    /// `sent` is the top level as the launch's settings granted it: an
    /// entry made since is new to the sandbox, whenever it appeared.
    pub(super) fn new(opts: SandboxOpts, sent: Vec<PathBuf>) -> Self {
        Self {
            opts,
            granted: sent,
        }
    }

    /// The settings to apply when the top holds an own entry the sandbox
    /// does not grant yet; `None` when it grants them all.
    pub(super) fn refresh(&mut self) -> Option<Value> {
        let fresh: Vec<PathBuf> = top_level(&self.opts.library)
            .into_iter()
            .filter(|p| !self.granted.contains(p))
            .collect();
        if fresh.is_empty() {
            return None;
        }
        self.granted.extend(fresh);
        self.granted.sort();
        Some(json!({ "sandbox": sandbox_json(&self.opts, &self.granted) }))
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn opts(library: &Path) -> SandboxOpts {
        SandboxOpts {
            library: library.to_path_buf(),
            cwd: crate::agents::agents_dir(library),
            hosts: Vec::new(),
            unsandboxed: false,
        }
    }

    fn written(settings: &Value) -> Vec<String> {
        settings["sandbox"]["filesystem"]["allowWrite"]
            .as_array()
            .unwrap()
            .iter()
            .map(|w| w.as_str().unwrap().to_string())
            .collect()
    }

    /// An entry made at the top after the launch is granted by the next
    /// refresh; a symlink, a dot-name and an old state folder's name never
    /// are, and nothing is sent when nothing new is there.
    #[test]
    fn a_refresh_grants_what_appeared_at_the_top_and_nothing_else() {
        let library = crate::test_support::Scratch::new("claude-grants");
        let outside = library.join("../claude-grants-outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::create_dir_all(library.join("courses/A/Course")).unwrap();
        std::fs::create_dir_all(library.join(".oculus/agents")).unwrap();
        std::fs::create_dir_all(library.join("Existing")).unwrap();
        let mut grants = Grants::new(opts(&library), top_level(&library));
        assert!(grants.refresh().is_none(), "nothing new");

        std::fs::create_dir_all(library.join("Receipts")).unwrap();
        std::fs::write(library.join("budget.xlsx"), "x").unwrap();
        for made in [".hidden", "lectures", "Agents", "\u{FF0E}oculus"] {
            std::fs::create_dir_all(library.join(made)).unwrap();
        }
        std::os::unix::fs::symlink(&outside, library.join("away")).unwrap();
        std::os::unix::fs::symlink(".oculus", library.join("state")).unwrap();
        std::os::unix::fs::symlink("courses/A/Course", library.join("synced")).unwrap();
        let settings = grants.refresh().expect("Receipts is new");
        let write = written(&settings);
        let at = |rel: &str| library.join(rel).display().to_string();
        for rel in [
            "Existing",
            "Receipts",
            "budget.xlsx",
            "courses",
            ".oculus/agents",
        ] {
            assert!(write.contains(&at(rel)), "{rel} in {write:?}");
        }
        for rel in [
            "",
            ".oculus",
            ".hidden",
            "lectures",
            "Agents",
            "\u{FF0E}oculus",
            "away",
            "state",
            "synced",
            "courses/A",
        ] {
            assert!(!write.contains(&at(rel)), "{rel:?} is not granted");
        }
        // The rest of the sandbox goes with it, as the CLI takes it whole.
        assert_eq!(settings["sandbox"]["enabled"], true);
        assert!(settings["sandbox"]["network"]["allowUnixSockets"].is_array());
        assert!(grants.refresh().is_none(), "granted once");

        let dirs = add_dirs(&library, &top_level(&library));
        assert!(dirs.contains(&library.join("Receipts")));
        assert!(dirs.contains(&library.join("courses")));
        assert!(
            !dirs.contains(&library.join("budget.xlsx")),
            "a file is no folder"
        );
        assert!(!dirs.contains(&library.to_path_buf()), "never the data dir");
        assert!(!dirs
            .iter()
            .any(|d| d.ends_with("away") || d.ends_with(".hidden")));
        let fresh = crate::test_support::Scratch::new("claude-grants-fresh");
        assert!(
            add_dirs(&fresh, &top_level(&fresh)).is_empty(),
            "no courses/ yet, no folder to add"
        );
    }

    /// The launch reads the top level once: an entry that appeared after
    /// that read is granted by the first refresh, though it was on disk
    /// when the thread's grants were made.
    #[test]
    fn an_entry_made_while_the_thread_launched_is_granted_by_the_first_refresh() {
        let library = crate::test_support::Scratch::new("claude-grants-launch");
        std::fs::create_dir_all(library.join(".oculus/agents")).unwrap();
        let sent = top_level(&library);
        std::fs::create_dir_all(library.join("Receipts")).unwrap();
        let mut grants = Grants::new(opts(&library), sent);
        let settings = grants.refresh().expect("Receipts was never sent");
        assert!(written(&settings).contains(&library.join("Receipts").display().to_string()));
    }

    /// Studio is a folder agents write by design: the file tools edit it
    /// unasked, as the shell writes it, and nothing else in `.oculus/` is added.
    #[test]
    fn studio_is_added_for_the_file_tools_and_the_rest_of_the_state_folder_is_not() {
        let library = crate::test_support::Scratch::new("claude-grants-studio");
        let studio = crate::library::paths::studio_dir(&library);
        std::fs::create_dir_all(&studio).unwrap();
        std::fs::create_dir_all(library.join(".oculus/agents")).unwrap();
        let dirs = add_dirs(&library, &top_level(&library));
        assert_eq!(dirs, [studio]);
    }
}
