//! The macOS write guard inherited by agy and its child processes.

use std::path::Path;
use std::sync::OnceLock;

use crate::harness::protected;
use crate::runtime::platform;

pub(super) const PROGRAM: &str = "/usr/bin/sandbox-exec";

pub(super) fn available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();
    cfg!(target_os = "macos")
        && *AVAILABLE.get_or_init(|| {
            // An enclosing allow-default sandbox can reapply its identical
            // profile. Also check that a distinct write restriction can start.
            [
                "(version 1)(allow default)",
                r#"(version 1)(allow default)(deny file-write* (literal "/"))"#,
            ]
            .iter()
            .all(|profile| {
                platform::command(PROGRAM)
                    .args(["-p", profile, "/usr/bin/true"])
                    .output()
                    .is_ok_and(|out| out.status.success())
            })
        })
}

/// Seatbelt has no case-insensitive flag. Only a '*' in a relative rule
/// is a wildcard; the library itself may contain glob or regex punctuation.
fn pattern(text: &str, glob: bool) -> String {
    let mut out = String::new();
    for c in text.chars() {
        match c {
            '*' if glob => out.push_str("[^/]*"),
            c if c.is_ascii_alphabetic() => {
                out.extend(['[', c.to_ascii_uppercase(), c.to_ascii_lowercase(), ']']);
            }
            c => out.push_str(&regex::escape(&c.to_string())),
        }
    }
    out
}

fn deny_patterns(library: &str) -> Vec<String> {
    let root = pattern(library.trim_end_matches('/'), false);
    let mut rules = Vec::new();
    let mut add = |glob: &str, suffix: &str| {
        rules.push(format!("^{root}/{}{suffix}", pattern(glob, true)));
    };
    for dir in protected::library_dirs() {
        add(&dir, "(/|$)");
    }
    for dir in protected::subject_dir_globs() {
        add(&dir, "(/|$)");
    }
    let subjects = protected::subjects_dir(Path::new(""));
    add(subjects.to_str().unwrap(), "(/[^/]+)?$");
    for glob in protected::state_file_globs() {
        add(&glob, "$");
    }
    for dir in protected::workspace_dir_rels() {
        add(&dir, "(/|$)");
    }
    for name in protected::top_level_denies().iter().filter(|n| *n != ".*") {
        add(name, "(/|$)");
    }
    rules
}

/// Every dot-name at the top, and the ones a write may still reach: the
/// state folder (whose own rules are above), the top-level notes' pictures
/// folder and keyd's fallback socket. Seatbelt has no lookahead, so the
/// profile pairs them with `require-not`.
fn dot_names(library: &str) -> (String, Vec<String>) {
    let root = pattern(library.trim_end_matches('/'), false);
    let kept = [
        crate::library::paths::STATE_DIR,
        crate::library::layout::note_assets_dir(),
    ]
    .map(|name| format!("^{root}/{}(/|$)", pattern(name, false)));
    let socket = format!("^{root}/{}$", pattern(KEYD_FALLBACK_SOCKET, false));
    (
        format!("^{root}/\\."),
        kept.into_iter().chain([socket]).collect(),
    )
}

/// keyd's socket at the top of the data dir, when `.oculus/keyd.sock`
/// would not fit a socket path (`keyd_core::paths::socket`).
const KEYD_FALLBACK_SOCKET: &str = ".keyd.sock";

fn quoted(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

/// Keep the directories that anchor the path rules in place. An unlink
/// rule on the directory itself still permits creating its writable children.
fn profile(library: &Path) -> Result<String, String> {
    let root = library
        .to_str()
        .ok_or("Antigravity's folder guard needs a UTF-8 library path")?;
    let mut out = String::from("(version 1)\n(allow default)\n(deny file-write*");
    for re in deny_patterns(root) {
        out.push_str(&format!("\n  (regex {})", quoted(&re)));
    }
    let (dots, kept) = dot_names(root);
    out.push_str(&format!(
        ")\n(deny file-write*\n  (require-all (regex {})",
        quoted(&dots)
    ));
    for re in kept {
        out.push_str(&format!("\n    (require-not (regex {}))", quoted(&re)));
    }
    out.push_str("))\n(deny file-write-unlink");
    let agents = crate::agents::agents_dir(library);
    let state = crate::library::paths::state_dir(library);
    for dir in [agents.as_path(), state.as_path()]
        .into_iter()
        .chain(library.ancestors())
    {
        out.push_str(&format!("\n  (literal {})", quoted(dir.to_str().unwrap())));
    }
    out.push(')');
    Ok(out)
}

pub(super) fn for_library(library: &Path) -> Result<Option<String>, String> {
    if !available() {
        return Ok(None);
    }
    let real = library.canonicalize().map_err(|e| {
        format!(
            "Antigravity's folder guard could not resolve {}: {e}",
            library.display()
        )
    })?;
    profile(&real).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_profile_covers_the_reserved_paths_in_present_and_future_subjects() {
        let scratch = crate::test_support::Scratch::new("agy-profile");
        let library = scratch.join("library.[1]");
        std::fs::create_dir_all(library.join("courses/X/Course")).unwrap();
        let slash = |p: &Path| crate::library::paths::slash_path(p);
        let set = regex::RegexSet::new(deny_patterns(&slash(&library))).unwrap();
        let (dots, kept) = dot_names(&slash(&library));
        let (dots, kept) = (
            regex::Regex::new(&dots).unwrap(),
            regex::RegexSet::new(kept).unwrap(),
        );
        struct Rules(regex::RegexSet, regex::Regex, regex::RegexSet);
        impl Rules {
            fn is_match(&self, path: &str) -> bool {
                self.0.is_match(path) || (self.1.is_match(path) && !self.2.is_match(path))
            }
        }
        let rules = Rules(set, dots, kept);
        for rel in [
            ".oculus/canvas-session",
            ".oculus/canvas-session/old",
            "courses",
            "courses/new",
            "courses/X/Course",
            "courses/X/Course/home.md",
            "courses/Future/course",
            "COURSES/Future/CouRse/a.pdf",
            "courses/X/.OCULUS/derived/a",
            ".oculus/settings.JSON",
            ".oculus/session.cookie",
            ".oculus/auth.token",
            ".oculus/app.log",
            ".oculus/vault.bin.lock",
            ".oculus/.vault.bin.42.tmp",
            ".Oculus/Vault.bin",
            ".oculus/agents/skills/a/SKILL.md",
            ".oculus/agents/.claude/x",
            ".oculus/agents/.agents",
            ".oculus/bin/Oculus Helper.app",
            ".library-move",
            ".library-move/done",
            ".Library-Move/journal.json",
            "courses/loose.pdf",
            ".hidden",
            ".hidden/x.md",
            ".DS_Store",
            ".oculus2/x",
            "agents",
            "Agents/notes.md",
            "STUDIO/v.json",
            "lectures/a.mp4",
            "whiteboard-pages/p",
            "canvas-pages",
        ] {
            assert!(rules.is_match(&slash(&library.join(rel))), "{rel}");
        }
        for rel in [
            "courses/X/notes.json",
            "courses/Y/notes/Course/file",
            "courses/Y/Coursework/a",
            ".oculus",
            ".oculus/oculus.db",
            ".oculus/oculus.db-wal",
            ".oculus/oculus.db-shm",
            ".oculus/studio/video.json",
            ".oculus/agents/scratch.json",
            ".keyd.sock",
            "Receipts/march.pdf",
            "timetable.png",
            "notes.json",
            ".assets/p.png",
            ".Oculus/agents/notes.md",
            "New folder/notes.md",
            "Receipts/agents/a.md",
            "Receipts/.hidden",
        ] {
            assert!(!rules.is_match(&slash(&library.join(rel))), "{rel}");
        }
        assert!(!rules.is_match(&slash(&keyd_core::paths::socket(&library))));
        assert!(!rules.is_match(&slash(&scratch.join("libraryX1/courses/X/Course/a"))));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn sandbox_exec_denies_course_writes_and_allows_own_files() {
        if !available() {
            elog!(
                "Skipping Antigravity folder guard integration test: sandbox-exec is unavailable."
            );
            return;
        }
        let scratch = crate::test_support::Scratch::new("agy-seatbelt");
        let library = scratch.join("a library.[1]*\"test");
        let course = library.join("courses/X/Course");
        std::fs::create_dir_all(&course).unwrap();
        let profile = for_library(&library).unwrap().unwrap();
        let touch = |path: &Path| {
            platform::command(PROGRAM)
                .args(["-p", &profile, "/usr/bin/touch"])
                .arg(path)
                .env("LC_ALL", "C")
                .output()
                .unwrap()
        };
        let file = course.join("blocked");
        let denied = touch(&file);
        assert!(!denied.status.success() && !file.exists());
        assert!(
            String::from_utf8_lossy(&denied.stderr).contains("Operation not permitted"),
            "{denied:?}"
        );
        let entry = library.join("courses/new-subject");
        let denied = touch(&entry);
        assert!(!denied.status.success() && !entry.exists(), "{denied:?}");
        let subject = course.parent().unwrap();
        let moved = platform::command(PROGRAM)
            .args(["-p", &profile, "/bin/mv"])
            .arg(subject)
            .arg(scratch.join("moved-subject"))
            .output()
            .unwrap();
        assert!(!moved.status.success() && subject.is_dir(), "{moved:?}");
        let own = library.join("courses/X/notes.md");
        let allowed = touch(&own);
        assert!(allowed.status.success() && own.is_file(), "{allowed:?}");
        std::fs::create_dir_all(library.join("Receipts")).unwrap();
        let top = library.join("Receipts/march.pdf");
        let allowed = touch(&top);
        assert!(allowed.status.success() && top.is_file(), "{allowed:?}");
        std::fs::create_dir_all(library.join(".library-move")).unwrap();
        let record = library.join(".library-move/done");
        let denied = touch(&record);
        assert!(!denied.status.success() && !record.exists(), "{denied:?}");
        // A folder made at the top under the guard is writable at once; a
        // dot-name or an old state folder's name is not.
        let mkdir = |path: &Path| {
            platform::command(PROGRAM)
                .args(["-p", &profile, "/bin/mkdir"])
                .arg(path)
                .output()
                .unwrap()
        };
        let made = library.join("New folder");
        assert!(mkdir(&made).status.success() && made.is_dir());
        let inside = made.join("notes.md");
        assert!(touch(&inside).status.success() && inside.is_file());
        for name in [".hidden", "agents", "Lectures"] {
            let path = library.join(name);
            assert!(!mkdir(&path).status.success() && !path.exists(), "{name}");
        }
        std::fs::create_dir_all(library.join(".oculus/studio")).unwrap();
        let studio = library.join(".oculus/studio/video.json");
        assert!(touch(&studio).status.success() && studio.is_file());
    }
}
