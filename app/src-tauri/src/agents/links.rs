use std::path::{Path, PathBuf};

use crate::library::layout;

use super::docs::{Skill, SKILLS};
use super::{
    agents_dir, AGENTS_DOC_NAME, MEMORIES_DIR, MEMORY_INDEX_NAME, RETIRED_AGENTS_DOC_REL,
    SKILLS_DIR,
};

/// Claude Code walks up from its cwd for `.claude/skills` and Codex for
/// `.agents/skills`; every thread and headless job runs in `agents/`, so both
/// links sit there, relative so the library stays movable. Nothing is written
/// outside the library (not `$CODEX_HOME`).
pub(super) const SCANNED_SKILL_DIRS: [&str; 2] = [".claude", ".agents"];

pub(super) fn link_agent_skills(data_dir: &Path) -> Result<(), String> {
    for scanned in SCANNED_SKILL_DIRS {
        let into = agents_dir(data_dir).join(scanned).join(SKILLS_DIR);
        std::fs::create_dir_all(&into)
            .map_err(|e| format!("cannot create {}: {e}", into.display()))?;
        for skill in SKILLS {
            // Up out of `<scanned>/skills`, back down into `skills/` beside it.
            link_skill(
                &into.join(skill.name),
                &format!("../../{SKILLS_DIR}/{}", skill.name),
                skill,
            )?;
        }
    }
    Ok(())
}

fn link_skill(link: &Path, target: &str, skill: &Skill) -> Result<Link, String> {
    let name = skill.name;
    match std::fs::symlink_metadata(link) {
        Ok(meta) if meta.file_type().is_symlink() => {
            if std::fs::read_link(link).is_ok_and(|t| t == Path::new(target)) {
                return Ok(Link::Current);
            }
            std::fs::remove_file(link).map_err(|e| format!("cannot relink {name}: {e}"))?;
        }
        #[cfg(windows)]
        Ok(meta) if meta.is_dir() => return refresh_skill_copy(link, skill),
        Ok(_) => {
            elog!("[oculus] {} is not ours — left alone", link.display());
            return Ok(Link::Skipped);
        }
        Err(_) => {}
    }
    link_skill_dir(target, link, skill)?;
    Ok(Link::Linked)
}

/// What linking one course folder did.
#[derive(Debug, PartialEq, Eq)]
pub enum Link {
    /// Something changed: an earlier layout's root `AGENTS.md` link went.
    Linked,
    /// Already as it should be.
    Current,
    /// A real file was there; left alone rather than overwritten.
    Skipped,
    /// No such course folder; nothing is created.
    Absent,
}

/// Scaffold and link one subject's course folder, addressed by Canvas code.
///
/// The sync-side entry point, so a new subject is linked by its first scrape.
pub fn link_course(data_dir: &Path, code: &str) -> Result<Link, String> {
    let dir = layout::course_root(data_dir, code);
    if !dir.is_dir() {
        return Ok(Link::Absent);
    }
    link_dir(data_dir, &dir)
}

/// Link every existing course folder's memories into the library's store,
/// and drop the `AGENTS.md` link an earlier layout left at its root.
///
/// The sweep behind `oculus docs`.
pub fn link_all(data_dir: &Path) -> Result<LinkReport, String> {
    let courses = layout::courses_dir(data_dir);
    let mut report = LinkReport::default();
    let entries = match std::fs::read_dir(&courses) {
        Ok(e) => e,
        // No courses yet is not a failure.
        Err(_) => return Ok(report),
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        match link_dir(data_dir, &dir)? {
            Link::Linked => report.linked.push(name),
            Link::Current => report.current += 1,
            Link::Skipped => report.skipped.push(name),
            Link::Absent => {}
        }
    }
    report.linked.sort();
    report.skipped.sort();
    Ok(report)
}

/// One subject's memory bucket, under the library's writable `agents/`.
pub fn subject_memories(data_dir: &Path, course_dir: &str) -> PathBuf {
    agents_dir(data_dir).join(MEMORIES_DIR).join(course_dir)
}

/// From a subject's `<agents>/memories` back to the library's buckets
/// (relative): up out of the subject's agents folder, then into the
/// library's own.
fn subject_memories_rel(name: &str) -> PathBuf {
    let depth = layout::agents_rel(name).matches('/').count() + 1;
    PathBuf::from("../".repeat(depth))
        .join(super::agents_rel())
        .join(MEMORIES_DIR)
}

/// Move a course folder's old `agents/memories/` into the library bucket and
///
/// A terminal agent in a course folder may still write the old path, so the
/// link keeps it pointing into the one store, inside the sandbox's writable
/// root. Idempotent: a correct link is left alone, and a colliding file is left
/// in place rather than overwriting what is filed.
fn adopt_course_memories(course_agents: &Path, bucket: &Path, name: &str) -> Result<(), String> {
    let old = course_agents.join(MEMORIES_DIR);
    let shown = format!("{}/{MEMORIES_DIR}", layout::agents_rel(name));
    #[cfg(windows)]
    if junction::exists(&old).unwrap_or(false) {
        if junction::get_target(&old)
            .ok()
            .and_then(|p| crate::runtime::platform::canonicalize(p).ok())
            == crate::runtime::platform::canonicalize(bucket).ok()
        {
            return Ok(());
        }
        // junction::delete removes only the reparse point; its empty directory remains.
        junction::delete(&old).map_err(|e| format!("cannot relink {shown}: {e}"))?;
        std::fs::remove_dir(&old).map_err(|e| e.to_string())?;
    }
    match std::fs::symlink_metadata(&old) {
        // Already a link; repoint it if it aims elsewhere (links are ours).
        Ok(meta) if meta.file_type().is_symlink() => {
            let want = subject_memories_rel(name).join(name);
            if std::fs::read_link(&old).is_ok_and(|t| t == want) {
                return Ok(());
            }
            std::fs::remove_file(&old).map_err(|e| format!("cannot relink {shown}: {e}"))?;
        }
        Ok(meta) if meta.is_dir() => {
            for entry in std::fs::read_dir(&old).into_iter().flatten().flatten() {
                let to = bucket.join(entry.file_name());
                if to.exists() {
                    continue;
                }
                std::fs::rename(entry.path(), &to)
                    .map_err(|e| format!("cannot move {shown}/{:?}: {e}", entry.file_name()))?;
            }
            // Only if emptied: a folder beats a link that hides unplaced files.
            if std::fs::read_dir(&old)
                .into_iter()
                .flatten()
                .flatten()
                .next()
                .is_some()
            {
                return Ok(());
            }
            std::fs::remove_dir(&old).map_err(|e| format!("cannot replace {shown}: {e}"))?;
        }
        // A real file called `memories` is somebody's.
        Ok(_) => return Ok(()),
        Err(_) => {}
    }
    let target = subject_memories_rel(name).join(name);
    #[cfg(unix)]
    std::os::unix::fs::symlink(&target, &old).map_err(|e| format!("cannot link {shown}: {e}"))?;
    #[cfg(windows)]
    junction::create(bucket, &old).map_err(|e| format!("cannot link {shown}: {e}"))?;
    #[cfg(not(unix))]
    let _ = target;
    Ok(())
}

/// One subject's memories bucket and the link to it. `Linked` when the root
/// `AGENTS.md` link an earlier layout made was removed.
fn link_dir(data_dir: &Path, dir: &Path) -> Result<Link, String> {
    let name = dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let bucket = subject_memories(data_dir, &name);
    std::fs::create_dir_all(&bucket)
        .map_err(|e| format!("cannot create agents/memories/{name}: {e}"))?;
    let course_agents = layout::agents_under(dir);
    std::fs::create_dir_all(&course_agents)
        .map_err(|e| format!("cannot create {}: {e}", layout::agents_rel(&name)))?;
    adopt_course_memories(&course_agents, &bucket, &name)?;

    // Named for the subject so the bucket is unmistakable. Written after the
    // migration so an index that came across is not replaced by a stub.
    let index = bucket.join(MEMORY_INDEX_NAME);
    if !index.exists() {
        let body = format!(
            "# Memories — {name}\n\n\
             Facts about this subject alone — including ones that came up while\n\
             working on something else. Anything true across subjects, or about the\n\
             student themselves, goes in the library's own `agents/memories/`.\n\n\
             The list below is written by `oculus memory` from the files beside it,\n\
             so it cannot fall behind them. Everything above the marker is yours.\n"
        );
        std::fs::write(&index, body)
            .map_err(|e| format!("cannot write agents/memories/{name}/{MEMORY_INDEX_NAME}: {e}"))?;
    }

    retire_root_doc(dir).map_err(|e| format!("cannot remove {name}'s {AGENTS_DOC_NAME} link: {e}"))
}

/// Removes the `AGENTS.md` an earlier layout linked at a subject's root: no
/// thread starts there, and it showed among the student's files. Only what
/// the app made goes: the symlink to its old target, or (Windows) the copy
/// whose marker still matches it. Anything else there is the student's.
fn retire_root_doc(dir: &Path) -> std::io::Result<Link> {
    let link = dir.join(AGENTS_DOC_NAME);
    let marker = dir.join(format!("{AGENTS_DOC_NAME}.oculus-managed"));
    let Ok(meta) = std::fs::symlink_metadata(&link) else {
        return Ok(Link::Current);
    };
    if meta.file_type().is_symlink() {
        if !std::fs::read_link(&link).is_ok_and(|t| t == Path::new(RETIRED_AGENTS_DOC_REL)) {
            return Ok(Link::Current);
        }
        std::fs::remove_file(&link)?;
        return Ok(Link::Linked);
    }
    let managed = meta.is_file()
        && std::fs::read(&link).is_ok_and(|body| {
            std::fs::read_to_string(&marker).is_ok_and(|recorded| recorded == sha256_hex(&body))
        });
    if !managed {
        return Ok(Link::Current);
    }
    std::fs::remove_file(&link)?;
    std::fs::remove_file(&marker)?;
    Ok(Link::Linked)
}

fn sha256_hex(bytes: &[u8]) -> String {
    ring::digest::digest(&ring::digest::SHA256, bytes)
        .as_ref()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[derive(Default)]
pub struct LinkReport {
    pub linked: Vec<String>,
    pub current: usize,
    pub skipped: Vec<String>,
}

/// A plain copy, where symlinks need a privilege (Windows).
#[cfg(not(unix))]
fn symlink_or_copy(_target: &str, link: &Path, body: &str) -> std::io::Result<()> {
    #[cfg(windows)]
    {
        managed_copy(link, body).map(|_| ())
    }
    #[cfg(not(windows))]
    {
        std::fs::write(link, body)
    }
}

/// The same for a skill directory: the copy is the skill written again.
#[cfg(unix)]
fn link_skill_dir(target: &str, link: &Path, skill: &Skill) -> Result<(), String> {
    std::os::unix::fs::symlink(target, link).map_err(|e| format!("cannot link {}: {e}", skill.name))
}

#[cfg(not(unix))]
fn link_skill_dir(_target: &str, link: &Path, skill: &Skill) -> Result<(), String> {
    let name = skill.name;
    std::fs::create_dir_all(link).map_err(|e| format!("cannot link {name}: {e}"))?;
    for (file, body) in skill.files {
        symlink_or_copy("", &link.join(file), body)
            .map_err(|e| format!("cannot link {name}/{file}: {e}"))?;
    }
    Ok(())
}

/// Refreshes each file of a copied skill; a file the user edited is kept.
#[cfg(windows)]
fn refresh_skill_copy(link: &Path, skill: &Skill) -> Result<Link, String> {
    let mut outcome = Link::Current;
    for (file, body) in skill.files {
        let done = managed_copy(&link.join(file), body)
            .map_err(|e| format!("cannot refresh {}/{file}: {e}", skill.name))?;
        if done != Link::Current {
            outcome = done;
        }
    }
    Ok(outcome)
}

#[cfg(any(windows, test))]
fn managed_copy(path: &Path, body: &str) -> std::io::Result<Link> {
    let marker = path.with_file_name(format!(
        "{}.oculus-managed",
        path.file_name().unwrap_or_default().to_string_lossy()
    ));
    let hash = sha256_hex;
    if let Ok(existing) = std::fs::read(path) {
        let recorded = std::fs::read_to_string(&marker).unwrap_or_default();
        if recorded != hash(&existing) {
            return Ok(Link::Skipped);
        }
        if existing == body.as_bytes() {
            return Ok(Link::Current);
        }
    }
    std::fs::write(path, body)?;
    std::fs::write(marker, hash(body.as_bytes()))?;
    Ok(Link::Linked)
}

#[cfg(test)]
mod copy_tests {
    use super::*;
    #[test]
    fn managed_copies_refresh_and_preserve_user_edits() {
        let dir = crate::test_support::Scratch::new("agent-managed-copy");
        let path = dir.join("AGENTS.md");
        assert_eq!(managed_copy(&path, "one").unwrap(), Link::Linked);
        assert_eq!(managed_copy(&path, "two").unwrap(), Link::Linked);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "two");
        std::fs::write(&path, "mine").unwrap();
        assert_eq!(managed_copy(&path, "three").unwrap(), Link::Skipped);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "mine");
    }
}
