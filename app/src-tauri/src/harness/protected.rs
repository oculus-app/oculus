//! The library paths Oculus protects. Each bridge renders these
//! in its own mechanism: Claude (`providers/claude/settings.rs`) as `Edit`
//! denies its sandbox also takes; Codex (`providers/codex/mod.rs`) as the
//! writable roots it is given; opencode's copy is static in
//! `templates/OPENCODE.template.json`, held to these by the test below; Rust
//! refuses a request naming them (`requests/policy.rs`). Antigravity's macOS
//! folder guard denies writes to these paths even when native Auto approves them.
//!
//! The app's own state folder (`.oculus/` at the data dir's top) is never
//! protected whole: it holds what a thread must write (the database, its
//! `agents/` cwd, `studio/`) beside what it must not, so the rules inside it
//! name folders and single-segment file patterns.
//!
//! The library's own zone (`layout::Zone::Own`) is writable without a
//! request: everything in a subject beside `Course/` and `.oculus/`, and the
//! student's own folders and files at the data dir's top, including one made
//! after the thread started. Every other dot-name at the top and the old
//! state folders' names (`layout::OLD_STATE_NAMES`) are not. Nor are
//! `courses/` itself and a file loose in it to the request policy, Codex and
//! Antigravity's guard; Claude's grant on `courses/` lets its tools write
//! there unasked (docs/harness.md, beside the containment table).

use std::path::{Path, PathBuf};

use crate::library::layout;
use crate::library::paths::state_rel;

mod savable;
pub use savable::{savable, SourceStamp};

/// Data-dir folders an agent reads but never writes, whole, as
/// data-dir-relative paths: a recordings folder outside the subjects (none
/// in the Drive tree), the launch moves' records (`migrate::RECORD_DIR`),
/// and the state folder's `STATE_DIRS`. `courses/` is not one: its
/// subjects' own files are writable.
pub fn library_dirs() -> Vec<String> {
    layout::library_roots()
        .into_iter()
        .filter(|d| *d != layout::COURSES_DIR)
        .chain([crate::library::migrate::RECORD_DIR])
        .map(str::to_string)
        .chain(STATE_DIRS.iter().map(|d| state_rel(d)))
        .collect()
}

/// Folders of the state folder (`library::paths::state_dir`) no agent
/// writes: the sign-in's attempt record and flags, keyd's installed helper,
/// which launchd runs, and the top level's parse records (`derived`, as
/// each subject's `.oculus/` holds its own). The state folder is not protected whole,
/// because the database, the agents' workspace and Studio are in it and
/// writable (see `providers/claude/settings.rs`).
pub const STATE_DIRS: [&str; 3] = ["canvas-session", "bin", "derived"];

/// The data-dir folder holding the subjects: writable, but for each
/// subject's `SUBJECT_DIRS` and anything directly inside it that is not in a
/// subject.
pub fn subjects_dir(library: &Path) -> PathBuf {
    layout::courses_dir(library)
}

/// Inside every subject, the folders no agent writes: `Course/` (what the
/// sync owns) and `.oculus/` (app state).
pub fn subject_dirs() -> Vec<&'static str> {
    layout::reserved_names()
}

/// `subject_dirs` as data-dir-relative rule patterns, `*` standing for any
/// one subject: `courses/*/Course`.
pub fn subject_dir_globs() -> Vec<String> {
    subject_dirs()
        .into_iter()
        .map(|d| format!("{}/*/{d}", layout::COURSES_DIR))
        .collect()
}

/// Rule patterns for what no agent makes at the data dir's top, beside the
/// folders above: any dot-name but the top-level notes' pictures folder
/// (`.*`, which also covers the state folder, so a renderer re-allows what
/// is writable in it), and each old state folder's name. The request policy
/// refuses these by `own_zone`; a CLI with a rule list renders them.
pub fn top_level_denies() -> Vec<String> {
    std::iter::once(".*".to_string())
        .chain(layout::OLD_STATE_NAMES.iter().map(|n| n.to_string()))
        .collect()
}

/// Whether a data-dir-relative path is in the own zone, which an agent
/// writes without asking: `layout::agent_own`, so never a name that folds to
/// a dot-name or a reserved one, nor an old state folder's name at the top.
pub fn own_zone(rel: &str) -> bool {
    layout::agent_own(rel)
}

/// App-owned folders inside the writable agents' workspace: generated
/// skills and the links scanning CLIs find them through (`crate::agents`).
pub const WORKSPACE_DIRS: [&str; 3] = ["skills", ".claude", ".agents"];

/// The workspace's folders that are the agent's own rather than its work:
/// its memories and every chat's raw log. Like `WORKSPACE_DIRS`, never
/// `savable`.
pub const AGENT_DIRS: [&str; 2] = [crate::agents::MEMORIES_DIR, crate::agents::THREADS_DIR];

/// Files at the workspace's top that are the app's or the agent's own: the
/// generated docs, the stubs the agent's taste and notes live in, opencode's
/// config, and the instruction files a CLI reads from its cwd.
pub const WORKSPACE_FILES: [&str; 7] = [
    crate::agents::AGENTS_DOC_NAME,
    crate::agents::CLI_DOC_NAME,
    crate::agents::OCULUS_DOC_NAME,
    crate::agents::TASTE_DOC_NAME,
    crate::agents::OPENCODE_CONFIG_NAME,
    "CLAUDE.md",
    "GEMINI.md",
];

/// `WORKSPACE_DIRS` as data-dir-relative paths: `.oculus/agents/skills`.
pub fn workspace_dir_rels() -> Vec<String> {
    WORKSPACE_DIRS
        .iter()
        .map(|d| format!("{}/{d}", crate::agents::agents_rel()))
        .collect()
}

/// Files directly in the state folder, by pattern. Never `oculus.db*`: see
/// `providers/claude/settings.rs`.
///
/// The sessions live in keyd's sealed vault, so the first two cover only the
/// files an earlier version kept, until keyd imports them. The last two are
/// the vault, its lock, and the temp file each write goes through: encrypted,
/// but an agent that deleted or truncated them would sign the student out of
/// everything.
pub const STATE_FILE_GLOBS: [&str; 6] = [
    "*.cookie",
    "*.token",
    "*.json",
    "*.log",
    "vault.bin*",
    ".vault.bin.*",
];

/// `STATE_FILE_GLOBS` as data-dir-relative patterns: `.oculus/*.cookie`.
/// One segment each, so none reaches the database or a writable folder.
pub fn state_file_globs() -> Vec<String> {
    STATE_FILE_GLOBS.iter().map(|g| state_rel(g)).collect()
}

/// Whether the rule pattern `glob` (`*` within a path segment, `**` across
/// segments) covers `path`: the check that no deny list reaches keyd's socket.
#[cfg(test)]
pub(super) fn glob_covers(glob: &str, path: &str) -> bool {
    let mut re = String::from("^");
    let mut chars = glob.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '*' if chars.peek() == Some(&'*') => {
                chars.next();
                re.push_str(".*");
            }
            '*' => re.push_str("[^/]*"),
            c => re.push_str(&regex::escape(&c.to_string())),
        }
    }
    re.push('$');
    regex::Regex::new(&re).unwrap().is_match(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn the_vault_and_the_temp_file_each_write_goes_through_are_covered() {
        use keyd_core::paths;
        let lib = Path::new("/l");
        let vault = paths::vault(lib);
        let covered = |path: &str| {
            state_file_globs()
                .iter()
                .any(|g| glob_covers(&format!("/l/{g}"), path))
        };
        for file in [vault.clone(), paths::vault_lock(&vault)] {
            let path = crate::library::paths::slash_path(&file);
            assert!(covered(&path), "no state glob covers {path}");
        }
        // The temp file a vault write goes through (`vault/store.rs`).
        assert!(covered("/l/.oculus/.vault.bin.4242.a1b2c3d4e5f6.tmp"));
        for file in [
            paths::cookie(lib),
            paths::ed_token(lib),
            paths::sign_in_log(lib),
        ] {
            let path = crate::library::paths::slash_path(&file);
            assert!(covered(&path), "no state glob covers {path}");
        }
    }

    /// The state folder holds what agents write beside what they must not:
    /// no rule covers the database's files, the workspace, Studio or keyd's
    /// socket, at either place the socket may be.
    #[test]
    fn nothing_writable_in_the_state_folder_is_covered() {
        let lib = Path::new("/l");
        let mut writable = crate::library::paths::db_write_paths(lib);
        writable.push(crate::agents::agents_dir(lib).join("notes.md"));
        writable.push(crate::library::paths::studio_dir(lib).join("videos/v/video.json"));
        writable.push(keyd_core::paths::socket(lib));
        writable.push(lib.join(".keyd.sock"));
        let rules: Vec<String> = library_dirs()
            .into_iter()
            .chain(workspace_dir_rels())
            .flat_map(|d| [d.clone(), format!("{d}/**")])
            .chain(state_file_globs())
            .map(|rule| format!("/l/{rule}"))
            .collect();
        for path in writable {
            let path = crate::library::paths::slash_path(&path);
            for rule in &rules {
                assert!(!glob_covers(rule, &path), "{rule} covers {path}");
            }
        }
        assert!(
            !rules
                .iter()
                .any(|r| r == "/l/.oculus" || r == "/l/.oculus/**"),
            "the state folder is never denied whole"
        );
    }

    #[test]
    fn a_glob_covers_by_segment() {
        assert!(glob_covers("/l/*.json", "/l/a.json"));
        assert!(!glob_covers("/l/*.json", "/l/sub/a.json"));
        assert!(glob_covers("/l/courses/**", "/l/courses/x/y"));
        assert!(!glob_covers("/l/.oculus/*.cookie", "/l/.oculus/keyd.sock"));
        assert!(!glob_covers(
            "/l/.oculus/*.json",
            "/l/.oculus/agents/a.json"
        ));
    }

    /// opencode's denies are relative to its cwd unless they name the library.
    #[test]
    fn the_opencode_template_denies_the_same_paths() {
        let raw = include_str!("../../templates/OPENCODE.template.json");
        let v: serde_json::Value = serde_json::from_str(raw).expect("the template is JSON");
        let edit = v
            .pointer("/permission/edit")
            .and_then(|e| e.as_object())
            .unwrap();
        let denied: Vec<&str> = edit
            .iter()
            .filter(|(_, v)| v.as_str() == Some("deny"))
            .map(|(k, _)| k.as_str())
            .collect();

        let mut want: Vec<String> = library_dirs()
            .iter()
            .map(|d| format!("{{{{LIBRARY}}}}/{d}/**"))
            .collect();
        want.extend(
            state_file_globs()
                .iter()
                .map(|g| format!("{{{{LIBRARY}}}}/{g}")),
        );
        for glob in subject_dir_globs() {
            want.push(format!("{{{{LIBRARY}}}}/{glob}"));
            want.push(format!("{{{{LIBRARY}}}}/{glob}/*"));
        }
        // Anything in `courses/` outside a subject's own zone.
        want.push(format!("{{{{LIBRARY}}}}/{}/**", layout::COURSES_DIR));
        // opencode's `*` crosses `/`, so `name/*` is the folder's subtree.
        for name in top_level_denies() {
            want.push(format!("{{{{LIBRARY}}}}/{name}"));
            if name != ".*" {
                want.push(format!("{{{{LIBRARY}}}}/{name}/*"));
            }
        }
        for w in &want {
            assert!(
                denied.contains(&w.as_str()),
                "the template does not deny {w}"
            );
        }
        for d in WORKSPACE_DIRS {
            assert!(
                denied.iter().any(|k| k.starts_with(&format!("{d}/"))),
                "the template denies nothing under the workspace's {d}"
            );
        }
        // opencode has no OS sandbox, so it alone may deny the database.
        let database = format!("{{{{LIBRARY}}}}/{}*", state_rel("oculus.db"));
        assert!(denied.contains(&database.as_str()), "{database}");
        for k in denied.iter().filter(|k| k.starts_with("{{LIBRARY}}/")) {
            assert!(
                want.iter().any(|w| w == k) || *k == database,
                "the template denies {k}, which the Rust list does not"
            );
        }
        let studio = format!("{{{{LIBRARY}}}}/{}/**", state_rel("studio"));
        assert_eq!(edit[&studio], "allow", "{studio}");
    }

    /// The template read as opencode reads it, by spelling: `*` crosses
    /// `/`, and the last rule that matches decides. A folder made at the top
    /// mid-chat is writable; dot-names, old state names and `courses/`'s own
    /// top are not.
    #[test]
    fn the_opencode_template_writes_the_top_level_but_no_reserved_name() {
        let raw = include_str!("../../templates/OPENCODE.template.json");
        let v: serde_json::Value = serde_json::from_str(raw).unwrap();
        let rules: Vec<(regex::Regex, String)> = v
            .pointer("/permission/edit")
            .and_then(|e| e.as_object())
            .unwrap()
            .iter()
            .map(|(pattern, verdict)| {
                let pattern = pattern.replace("{{LIBRARY}}", "/l");
                let re = format!("^{}$", regex::escape(&pattern).replace(r"\*", ".*"));
                (
                    regex::Regex::new(&re).unwrap(),
                    verdict.as_str().unwrap().to_string(),
                )
            })
            .collect();
        let verdict = |path: &str| {
            rules
                .iter()
                .rev()
                .find(|(re, _)| re.is_match(path))
                .map(|(_, v)| v.clone())
                .unwrap()
        };
        for path in [
            "/l/Receipts/march.pdf",
            "/l/New folder/notes.md",
            "/l/timetable.png",
            "/l/.assets/p.png",
            "/l/Receipts/agents/a.md",
            "/l/courses/X/notes.md",
            "/l/.oculus/studio/videos/a/video.json",
        ] {
            assert_eq!(verdict(path), "allow", "{path}");
        }
        for path in [
            "/l/.hidden/x.md",
            "/l/.DS_Store",
            "/l/.oculus/notes.md",
            "/l/.oculus/vault.bin",
            "/l/.library-move/done",
            "/l/agents",
            "/l/agents/notes.md",
            "/l/lectures/a.mp4",
            "/l/courses/loose.pdf",
            "/l/courses/X/Course/a.pdf",
        ] {
            assert_eq!(verdict(path), "deny", "{path}");
        }
    }

    #[test]
    fn the_own_zone_is_a_subjects_files_but_course_and_oculus_and_the_top_but_dot_names() {
        for rel in [
            "courses/X/notes.md",
            "courses/X/Exam prep/deep/scan.pdf",
            "courses/Y/board.whiteboard",
            "courses/X/.assets/p.png",
            "Receipts",
            "Receipts/march.pdf",
            "timetable.png",
            "notes.json",
            ".assets/p.png",
        ] {
            assert!(own_zone(rel), "{rel}");
        }
        for rel in [
            "courses",
            "courses/X",
            "courses/loose.pdf",
            "courses/X/Course/Files/a.pdf",
            "courses/X/course/home.md",
            "courses/X/.oculus/agents/INSTRUCTIONS.md",
            ".oculus/agents/notes.md",
            ".oculus/oculus.db",
            ".library-move/done",
            ".DS_Store",
            "courses/X/../../.oculus/oculus.db",
            "",
            "agents/notes.md",
            "Lectures",
            "\u{FF0E}oculus/x",
        ] {
            assert!(!own_zone(rel), "{rel}");
        }
        assert_eq!(
            subject_dir_globs(),
            ["courses/*/Course", "courses/*/.oculus"]
        );
        assert_eq!(
            library_dirs(),
            [
                ".library-move",
                ".oculus/canvas-session",
                ".oculus/bin",
                ".oculus/derived"
            ]
        );
        assert_eq!(
            workspace_dir_rels(),
            [
                ".oculus/agents/skills",
                ".oculus/agents/.claude",
                ".oculus/agents/.agents"
            ]
        );
    }

    /// No rule any CLI renders reaches the student's own files at the top.
    #[test]
    fn no_rule_covers_the_students_own_folders_at_the_top() {
        let rules: Vec<String> = library_dirs()
            .into_iter()
            .chain(workspace_dir_rels())
            .flat_map(|d| [d.clone(), format!("{d}/**")])
            .chain(state_file_globs())
            .chain(
                subject_dir_globs()
                    .into_iter()
                    .flat_map(|g| [g.clone(), format!("{g}/**")]),
            )
            .map(|rule| format!("/l/{rule}"))
            .collect();
        for path in [
            "Receipts/march.pdf",
            "timetable.png",
            "notes.json",
            "vault.bin",
            ".assets/p.png",
        ] {
            for rule in &rules {
                assert!(
                    !glob_covers(rule, &format!("/l/{path}")),
                    "{rule} covers {path}"
                );
            }
        }
    }
}
