//! The agent-facing docs that live in the library.
//!
//! `agents/` in the data directory holds one `AGENTS.md` for every subject,
//! symlinked into each course folder, the stubs a human authors, and the memory
//! layer an agent writes back into (`TASTE.md`, `memories/`, `memories/<CODE>/`).
//! It is written from `oculus docs` and from every sync, so the rules about what
//! may be overwritten live here.
//!
//! Both memory buckets live under `agents/` because an in-app thread may write
//! it and not a subject's `.oculus/`; [`link_dir`] leaves a symlink in each
//! course folder so the per-course path lands in the same store. Nothing here reads the
//! memory layer back or writes a memory — [`crate::agents::memory`] owns the contents.
//!
//! `agents/skills/` is the one copy of the skills: Claude Code and Codex find it
//! through relative links (`.claude/skills`, `.agents/skills`), opencode through
//! its config. Skills and `AGENTS.md` are regenerated every time; a stale one is
//! followed as a procedure. See docs/harness.md.

mod docs;
mod links;
pub mod memory;
mod taste;
#[cfg(test)]
#[cfg(unix)]
mod tests;

pub use docs::{ensure_library_docs, LibraryDocs, AGENTS_DOC};
pub use links::{link_all, link_course, subject_memories, Link, LinkReport};
pub use taste::{refresh_taste, Refresh};

use std::path::{Path, PathBuf};

pub const AGENTS_DOC_NAME: &str = "AGENTS.md";
pub const CLI_DOC_NAME: &str = "OCULUS-CLI.md";
const SKILLS_DIR: &str = "skills";
const SKILL_DOC_NAME: &str = "SKILL.md";
const TASTE_DOC_NAME: &str = "TASTE.md";
/// The index beside the memories, in both buckets.
const MEMORY_INDEX_NAME: &str = "MEMORY.md";
pub const MEMORIES_DIR: &str = "memories";
/// opencode's config, which `harness::write_opencode_config` renders here.
pub const OPENCODE_CONFIG_NAME: &str = "opencode.json";

/// What a course folder's root `AGENTS.md` link pointed at before the state
/// folder; `links` removes a link that still does.
const RETIRED_AGENTS_DOC_REL: &str = "../../agents/AGENTS.md";

/// The agents' workspace, in the state folder: every thread's cwd.
pub const AGENTS_DIR: &str = "agents";

pub fn agents_dir(data_dir: &Path) -> PathBuf {
    crate::library::paths::state_dir(data_dir).join(AGENTS_DIR)
}

/// `.oculus/agents`, the workspace as a data-dir-relative path spells it.
pub fn agents_rel() -> String {
    crate::library::paths::state_rel(AGENTS_DIR)
}

/// A data-dir-relative path as a thread spells it from its cwd, the
/// workspace: `courses/X` is `../../courses/X` from `.oculus/agents`.
pub fn from_workspace(rel: &str) -> String {
    let up = agents_rel().split('/').count();
    format!("{}{rel}", "../".repeat(up))
}

/// Whether a data-dir-relative path is one the viewers may read: inside a
/// library folder (`layout::library_roots`) or the workspace, the asset
/// protocol's scope in tauri.conf.json. Plain segments only.
pub fn readable(relative: &Path) -> bool {
    use std::path::Component;
    let plain = relative
        .components()
        .all(|part| matches!(part, Component::Normal(_)));
    let in_library = relative.components().next().is_some_and(|first| {
        crate::library::layout::library_roots()
            .iter()
            .any(|root| first.as_os_str() == *root)
    });
    plain && (in_library || relative.starts_with(agents_rel()))
}

/// The one copy of the skills. Everything else about them is a route to here.
pub fn skills_dir(data_dir: &Path) -> PathBuf {
    agents_dir(data_dir).join(SKILLS_DIR)
}
