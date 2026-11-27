//! What Rust checks before a request reaches the student. A request that
//! names paths (a file change, extra file access) is refused when one of
//! them is protected (`protected.rs`): the student never sees it, and the
//! CLI is told no. The student's own files (in a subject or at the data
//! dir's top) are not protected; a CLI whose
//! sandbox could not grant them asks, and the student decides. A shell
//! command cannot be checked this way, since nothing can tell from a
//! command line what it will touch; its row says so instead, and the name
//! denies and `OCULUS_AGENT` keep refusing inside an approved command.
//! A file change or file grant naming only own files is allowed unseen
//! (`own_grant`): the rule is read when the CLI asks, so a folder made at
//! the top after the thread started is the student's at once.

use std::path::{Component, Path, PathBuf};

use crate::harness::protected::{own_zone, STATE_DIRS, STATE_FILE_GLOBS, WORKSPACE_DIRS};
use crate::harness::requests::{Action, Decision, NewRequest, RequestOption};
use crate::library::paths::STATE_DIR;

/// The first of `paths` that no agent may write in the library at
/// `library`. Relative paths are read against `cwd`, the agent's folder.
pub fn protected(library: &Path, cwd: &Path, paths: &[String]) -> Option<String> {
    let library = resolve(library);
    paths
        .iter()
        .find(|p| covers(&library, &resolve(&absolute(cwd, p))))
        .cloned()
}

/// Whether `path` (absolute, or relative to `cwd`) is in the library's own
/// zone, which an agent writes without asking.
pub fn in_own_zone(library: &Path, cwd: &Path, path: &str) -> bool {
    let library = resolve(library);
    library_rel(&library, &resolve(&absolute(cwd, path))).is_some_and(|rel| own_zone(&rel))
}

/// Whether an agent writes `path` without asking, on its real path: under
/// the chat's folder (`cwd`) or a folder agents write by design
/// (`paths::agent_write_dirs`: Studio), compared with case so a folder spelt
/// differently is asked about, or in the own zone. Callers check
/// `protected` first, which refuses the app's own folders inside these.
pub fn agent_writes(library: &Path, cwd: &Path, path: &str) -> bool {
    let real = resolve(&absolute(cwd, path));
    let within = std::iter::once(cwd.to_path_buf())
        .chain(crate::library::paths::agent_write_dirs(library))
        .map(|root| resolve(&root))
        .any(|root| real != root && real.starts_with(&root));
    within || in_own_zone(library, cwd, path)
}

/// The option that allows `request` unseen, when all it asks is to write
/// what an agent writes by design (`agent_writes`): a file change, or a
/// grant of file access with no network in it, naming at least one path and
/// only such paths. Those are the agent's to write in every mode, so such a
/// request is answered by this rule, not by the student.
pub fn own_grant(library: &Path, cwd: &Path, request: &NewRequest) -> Option<RequestOption> {
    let files_only = match request.action {
        Action::FileChange => true,
        Action::Permissions => request.payload["permissions"]
            .as_object()
            .is_some_and(|asked| asked.iter().all(|(k, v)| k == "fileSystem" || v.is_null())),
        _ => false,
    };
    let own =
        !request.paths.is_empty() && request.paths.iter().all(|p| agent_writes(library, cwd, p));
    (files_only && own)
        .then(|| {
            request
                .options
                .iter()
                .find(|o| o.decision == Decision::Accept)
                .cloned()
        })
        .flatten()
}

fn absolute(cwd: &Path, path: &str) -> PathBuf {
    let path = Path::new(path);
    match path.is_absolute() {
        true => path.to_path_buf(),
        false => cwd.join(path),
    }
}

/// `path` relative to `library`, `/`-separated in its own spelling, when it
/// is inside it. The prefix is compared without case: the student's disk
/// ignores it by default, so `Courses/` is `courses/`, existing or not.
fn library_rel(library: &Path, path: &Path) -> Option<String> {
    let lib: Vec<String> = parts(library);
    let all: Vec<String> = parts(path);
    let inside = all.len() >= lib.len()
        && lib
            .iter()
            .zip(&all)
            .all(|(a, b)| a.to_lowercase() == b.to_lowercase());
    inside.then(|| all[lib.len()..].join("/"))
}

fn parts(path: &Path) -> Vec<String> {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect()
}

fn covers(library: &Path, path: &Path) -> bool {
    // A folder that holds the library: a grant on it reaches every
    // protected folder inside.
    if library_rel(path, library).is_some() {
        return true;
    }
    let Some(rel) = library_rel(library, path) else {
        return false;
    };
    let lower = rel.to_lowercase();
    let parts: Vec<&str> = lower.split('/').filter(|p| !p.is_empty()).collect();
    match parts.as_slice() {
        // The library itself: a grant on it reaches every protected folder.
        [] => true,
        [state, inside @ ..] if *state == STATE_DIR => state_covers(inside),
        // The student's own files, in a subject or at the top, are writable;
        // `courses/` itself, a subject's folder, its `Course/` and `.oculus/`,
        // and every other dot-name at the top (`.library-move/`) are not.
        _ => !own_zone(&rel),
    }
}

/// Inside the state folder: the folder itself (a grant on it reaches the
/// vault), keyd's session folder, the workspace itself and its app-owned
/// folders, and the files `STATE_FILE_GLOBS` names. The database, Studio and
/// the rest of the workspace are the student's to decide.
fn state_covers(inside: &[&str]) -> bool {
    match inside {
        [] => true,
        [dir, ..] if STATE_DIRS.contains(dir) => true,
        // A grant on the workspace reaches the app-owned folders inside it.
        [agents] => {
            *agents == crate::agents::AGENTS_DIR
                || STATE_FILE_GLOBS
                    .iter()
                    .any(|glob| glob_matches(glob, agents))
        }
        [agents, dir, ..] => *agents == crate::agents::AGENTS_DIR && WORKSPACE_DIRS.contains(dir),
    }
}

/// `*` within one name, as `STATE_FILE_GLOBS` uses it.
fn glob_matches(glob: &str, name: &str) -> bool {
    let pieces: Vec<&str> = glob.split('*').collect();
    let (first, last) = (pieces[0], pieces[pieces.len() - 1]);
    if pieces.len() == 1 {
        return name == glob;
    }
    if !name.starts_with(first) || !name[first.len()..].ends_with(last) {
        return false;
    }
    let mut rest = &name[first.len()..name.len() - last.len()];
    for piece in &pieces[1..pieces.len() - 1] {
        match rest.find(piece) {
            Some(at) => rest = &rest[at + piece.len()..],
            None => return false,
        }
    }
    true
}

/// `path` with `.` and `..` worked out, and its deepest existing folder
/// through its symlinks, so `/tmp` and `/private/tmp` compare equal. A
/// dangling symlink on the way is followed to its target, which is what a
/// write through it would create.
pub(in crate::harness) fn resolve(path: &Path) -> PathBuf {
    resolve_from(path, 0)
}

/// Symlinks followed before a chain is taken as a loop, as the kernel's
/// `MAXSYMLINKS`.
const MAX_LINKS: u8 = 32;

fn resolve_from(path: &Path, links: u8) -> PathBuf {
    let lexical = lexical(path);
    let mut existing = lexical.clone();
    let mut tail = Vec::new();
    while !existing.exists() {
        if let Ok(target) = std::fs::read_link(&existing) {
            // A loop names nothing; an empty path holds the library, so
            // it is refused.
            if links >= MAX_LINKS {
                return PathBuf::new();
            }
            let parent = existing.parent().unwrap_or(Path::new("/"));
            let mut next = parent.canonicalize().unwrap_or(parent.to_path_buf());
            next.push(target);
            next.extend(tail.iter().rev());
            return resolve_from(&next, links + 1);
        }
        match existing.file_name() {
            Some(name) => tail.push(name.to_os_string()),
            None => return lexical,
        }
        if !existing.pop() {
            return lexical;
        }
    }
    let mut out = existing.canonicalize().unwrap_or(existing);
    out.extend(tail.into_iter().rev());
    out
}

fn lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(path: &str) -> bool {
        let library = Path::new("/lib/oculus");
        let cwd = crate::agents::agents_dir(library);
        protected(library, &cwd, &[path.to_string()]).is_some()
    }

    #[test]
    fn protected_folders_and_root_files_are_refused_and_the_rest_is_not() {
        for path in [
            "/lib/oculus/courses",
            "/lib/oculus/courses/maths",
            "/lib/oculus/courses/loose.pdf",
            "/lib/oculus/courses/maths/Course/Files/a.pdf",
            "/lib/oculus/courses/maths/Course",
            "/lib/oculus/courses/maths/Course/Recordings/x/transcript.vtt",
            "/lib/oculus/courses/maths/.oculus/agents/INSTRUCTIONS.md",
            "/lib/oculus/courses/maths/.oculus",
            "/lib/oculus/.oculus/canvas-session/x",
            "/lib/oculus/.oculus/derived/Receipts/order/order.md",
            "/lib/oculus/.oculus/vault.bin",
            "/lib/oculus/.oculus/.vault.bin.tmp",
            "/lib/oculus/.oculus/settings.json",
            "/lib/oculus",
            "/lib/oculus/.oculus",
            "/lib/oculus/.oculus/agents",
            "/lib/oculus/.oculus/agents/skills/a/SKILL.md",
            "/lib/oculus/.oculus/agents/.claude/settings.json",
            "/lib/oculus/.oculus/bin/Oculus Helper.app/Contents/MacOS/oculus-keyd",
            "/lib/oculus/.library-move/done",
            "/lib/oculus/.library-move",
            "/lib/oculus/.Library-Move/journal.json",
            "/lib/oculus/.DS_Store",
            "../../.library-move/lock",
            "../../courses/maths/Course/home.md",
            "skills/x",
            "/lib/oculus/.oculus/agents/../../courses/y/Course/z",
            "/lib",
            "/",
            "/lib/oculus/Courses/x/COURSE/home.md",
            "/lib/oculus/courses/x/.OCULUS/derived/a.pages.json",
            "/LIB/Oculus/COURSES",
            "/lib/oculus/.oculus/Settings.JSON",
            "/lib/oculus/.Oculus/Agents/Skills/x",
        ] {
            assert!(check(path), "{path} is protected");
        }
        for path in [
            "/lib/oculus/courses/maths/notes.md",
            "/lib/oculus/courses/maths/Exam prep/deep/scan.pdf",
            "/lib/oculus/courses/other/summary.md",
            "/lib/oculus/Courses/maths/Notes/a.md",
            "/lib/oculus/courses/maths/settings.json",
            "../../courses/maths/notes.md",
            "/lib/oculus/.oculus/agents/../../courses/maths/a.md",
            "/lib/oculus/.oculus/agents/notes.md",
            "/lib/oculus/.oculus/agents/attachments/a.png",
            "/lib/oculus/.oculus/studio/video/video.json",
            "/elsewhere/courses/x",
            "/lib/oculus/.oculus/oculus.db",
            // The top level holds nothing of the app's: a file there is the student's.
            "/lib/oculus/settings.json",
            "/lib/oculus/vault.bin",
            "/lib/oculus/Receipts/march.pdf",
            "/lib/oculus/Receipts",
            "/lib/oculus/.assets/p.png",
            "../../Videos/Raw/talk.mp4",
            "scratch/out.txt",
        ] {
            assert!(!check(path), "{path} is not protected");
        }
    }

    #[test]
    fn the_own_zone_is_read_against_the_chats_folder() {
        let library = Path::new("/lib/oculus");
        let cwd = crate::agents::agents_dir(library);
        for path in [
            "../../courses/maths/notes.md",
            "/lib/oculus/courses/maths/Exam prep/a.md",
            "/LIB/oculus/Courses/maths/a.md",
            // The student's own folders and files at the top of the library.
            "../../Receipts/march.pdf",
            "../../timetable.png",
            "/lib/oculus/Videos/Raw/talk.mp4",
            "/lib/oculus/Videos",
            "/lib/oculus/.assets/p.png",
        ] {
            assert!(in_own_zone(library, &cwd, path), "{path}");
        }
        for path in [
            "notes.md",
            "../../courses/maths/Course/home.md",
            "../../courses/maths/.oculus/x",
            "../../courses/maths",
            "../../courses",
            "../../courses/loose.pdf",
            "../../.library-move/done",
            "../../.oculus/oculus.db",
            "../../.DS_Store",
            "../..",
            "/elsewhere/courses/maths/a.md",
            "/elsewhere/Receipts/a.pdf",
        ] {
            assert!(!in_own_zone(library, &cwd, path), "{path}");
        }
    }

    #[test]
    fn a_glob_matches_within_one_name() {
        assert!(glob_matches("*.json", "a.json"));
        assert!(glob_matches(".vault.bin.*", ".vault.bin.123"));
        assert!(glob_matches("vault.bin*", "vault.bin"));
        assert!(!glob_matches("*.json", "a.jsonl"));
        assert!(!glob_matches("vault.bin*", "my.vault.bin"));
    }

    /// The rule is read when the request comes, on the real path: a folder
    /// made after the thread started is the student's, and no symlink, case
    /// variant, `..` or folded name reaches past it.
    #[cfg(unix)]
    #[test]
    fn the_top_level_is_judged_on_the_real_path_when_asked() {
        use std::os::unix::fs::symlink;
        let scratch = crate::test_support::Scratch::new("policy-real-top");
        let library = scratch.join("library");
        let outside = scratch.join("outside");
        for dir in [
            "courses/S/Course",
            "courses/S/.oculus",
            ".oculus/agents",
            ".library-move",
            "agents",
        ] {
            std::fs::create_dir_all(library.join(dir)).unwrap();
        }
        std::fs::create_dir_all(&outside).unwrap();
        let cwd = crate::agents::agents_dir(&library);
        // Made after the thread started, as the student or the agent would.
        std::fs::create_dir_all(library.join("Receipts")).unwrap();
        symlink(&outside, library.join("away")).unwrap();
        symlink(".oculus", library.join("state")).unwrap();
        symlink("courses/S/Course", library.join("synced")).unwrap();
        symlink(outside.join("new.txt"), library.join("dangling")).unwrap();
        symlink(".oculus/vault.bin", library.join("vault")).unwrap();
        symlink(&outside, library.join("Receipts/inner")).unwrap();
        symlink("../.oculus", library.join("Receipts/up")).unwrap();
        symlink("loop", library.join("loop")).unwrap();
        let at = |rel: &str| library.join(rel).display().to_string();
        let own = |rel: &str| in_own_zone(&library, &cwd, &at(rel));
        let refused = |rel: &str| protected(&library, &cwd, &[at(rel)]).is_some();

        for rel in [
            "Receipts",
            "Receipts/march.pdf",
            "Receipts/new/deep.md",
            "New.md",
        ] {
            assert!(own(rel) && !refused(rel), "{rel}");
        }
        assert!(in_own_zone(&library, &cwd, "../../Receipts/a.pdf"));
        // Refused unseen: never the student's to grant.
        for rel in [
            "",
            "courses",
            "courses/loose.pdf",
            "courses/S",
            "courses/New",
            "courses/S/Course/a.pdf",
            "courses/S/.oculus/x",
            ".oculus",
            ".oculus/vault.bin",
            ".library-move/done",
            ".anything/x",
            ".Oculus/vault.bin",
            "Courses/loose.pdf",
            "Receipts/../.oculus/vault.bin",
            "Receipts/./../courses/S/Course/a.pdf",
            "\u{FF0E}oculus/x",
            " .oculus/x",
            "agents/x.md",
            "Agents",
            "studio/v.json",
            "Whiteboard-Pages/p",
            "canvas-pages",
            "LECTURES/a.mp4",
            // A symlink leads to what it names.
            "state/vault.bin",
            "synced/a.pdf",
            "vault",
            "Receipts/up/vault.bin",
        ] {
            assert!(refused(rel) && !own(rel), "{rel:?} is refused");
        }
        // A symlink out of the library is never the own zone: the student
        // is asked, as for any path outside it.
        for rel in [
            "away",
            "away/key",
            "dangling",
            "Receipts/inner",
            "Receipts/inner/key",
        ] {
            assert!(!own(rel), "{rel} is not the student's");
            assert!(!refused(rel), "{rel} is outside the library");
        }
        assert!(!own("loop/x") && refused("loop/x"));
    }
}
