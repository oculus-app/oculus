//! What a Claude thread may write at the data dir's top, kept current while
//! it runs. The launch names the student's own top-level entries on disk
//! then: their folders as `--add-dir`, every one in the sandbox's
//! `allowWrite`. An entry made later (by the student in Drive, or by the
//! agent's file tool, which asks and is allowed by `requests::policy`) is
//! added with an `apply_flag_settings` control request, sent before the next
//! message and after each tool result, so the next command can write it.
//! The CLI keeps a granted path for the session: a request can add to
//! `allowWrite` but not take one away (measured on 2.1.332).

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::library::layout;

use super::settings::{sandbox_json, SandboxOpts};

/// The folders opened with `--add-dir`: the subjects' folder and the
/// student's own folders at the top, those that exist (a library before its
/// first sync has no `courses/`). Never the data dir itself: that would
/// make all of it writable to the sandbox, `.oculus/` and every dot-name
/// with it (the CLI grants an added folder's writes as well as its reads).
pub(super) fn add_dirs(library: &Path) -> Vec<PathBuf> {
    std::iter::once(layout::courses_dir(library))
        .chain(top_level(library))
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
    pub(super) fn new(opts: SandboxOpts) -> Self {
        let granted = top_level(&opts.library);
        Self { opts, granted }
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
        let mut grants = Grants::new(opts(&library));
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

        let dirs = add_dirs(&library);
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
    }
}
