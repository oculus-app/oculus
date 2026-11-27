use std::os::unix::fs::symlink;
use std::path::Path;

use super::savable;
use crate::test_support::Scratch;

const WS: &str = ".oculus/agents";

/// A data dir with a workspace holding the agent's own files, its work, an
/// attachment, and the state folder's database and vault beside it.
fn library(name: &str) -> Scratch {
    let root = Scratch::new(name);
    for (rel, body) in [
        ("outputs/dfa.svg", "<svg/>"),
        ("outputs/plots/week.png", "png"),
        ("attachments/20261127-1.png", "png"),
        ("notes.md", "working notes"),
        ("memories/MEMORY.md", "index"),
        ("memories/explain-plainly.md", "memory"),
        ("memories/COMP30026/dfa.md", "subject memory"),
        ("TASTE.md", "taste"),
        ("AGENTS.md", "agents"),
        ("OCULUS.md", "notes to agents"),
        ("OCULUS-CLI.md", "cli"),
        ("opencode.json", "{}"),
        ("CLAUDE.md", "claude"),
        ("skills/oculus-studio/SKILL.md", "skill"),
        ("threads/12.ndjson", "{}"),
        (".claude/settings.json", "{}"),
        (".agents/skills/x/SKILL.md", "skill"),
        (".codex/config.toml", ""),
        ("outputs/.hidden.png", "png"),
    ] {
        write(&root.join(WS).join(rel), body);
    }
    write(&root.join(".oculus/oculus.db"), "db");
    write(&root.join(".oculus/vault.bin"), "vault");
    write(&root.join("courses/COMP30026/notes.md"), "own");
    write(&root.join("Receipts/march.pdf"), "pdf");
    root
}

fn write(path: &Path, body: &str) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn ok(root: &Path, inner: &str) -> bool {
    savable(root, &format!("{WS}/{inner}")).is_some()
}

#[test]
fn what_the_agent_made_and_what_the_student_attached_is_savable() {
    let root = library("savable-ok");
    for inner in [
        "outputs/dfa.svg",
        "outputs/plots/week.png",
        "attachments/20261127-1.png",
        "notes.md",
    ] {
        assert!(ok(&root, inner), "{inner}");
    }
    let saved = savable(&root, &format!("{WS}/outputs/dfa.svg")).unwrap();
    assert_eq!(saved.stamp.size, 6);
    assert_eq!(saved.read().unwrap(), (b"<svg/>".to_vec(), saved.stamp));
}

#[test]
fn the_agents_own_files_are_not() {
    let root = library("savable-own");
    for inner in [
        "memories/MEMORY.md",
        "memories/explain-plainly.md",
        "memories/COMP30026/dfa.md",
        "TASTE.md",
        "AGENTS.md",
        "OCULUS.md",
        "OCULUS-CLI.md",
        "opencode.json",
        "CLAUDE.md",
        "skills/oculus-studio/SKILL.md",
        "threads/12.ndjson",
        ".claude/settings.json",
        ".agents/skills/x/SKILL.md",
        ".codex/config.toml",
        "outputs/.hidden.png",
        // Spelled in another case, which reaches the same file on a
        // case-blind volume.
        "Memories/explain-plainly.md",
        "taste.md",
        "SKILLS/oculus-studio/SKILL.md",
        "Threads/12.ndjson",
        // Folders are never a file to save.
        "outputs",
        "memories",
    ] {
        assert!(!ok(&root, inner), "{inner}");
    }
}

#[test]
fn a_step_up_never_reaches_them() {
    let root = library("savable-up");
    for rel in [
        format!("{WS}/outputs/../memories/explain-plainly.md"),
        format!("{WS}/outputs/../TASTE.md"),
        format!("{WS}/outputs/../skills/oculus-studio/SKILL.md"),
        format!("{WS}/outputs/../threads/12.ndjson"),
        format!("{WS}/outputs/../.claude/settings.json"),
        format!("{WS}/outputs/../../oculus.db"),
        format!("{WS}/../vault.bin"),
        format!("{WS}/./outputs/dfa.svg"),
        format!("{WS}//outputs/dfa.svg"),
        format!("{WS}/outputs/..\\TASTE.md"),
    ] {
        assert!(savable(&root, &rel).is_none(), "{rel}");
    }
}

#[test]
fn a_link_in_outputs_never_reaches_them() {
    let root = library("savable-link");
    let ws = root.join(WS);
    let outputs = ws.join("outputs");
    for (link, to) in [
        ("memory.md", ws.join("memories/explain-plainly.md")),
        ("taste.md", ws.join("TASTE.md")),
        ("agents.md", ws.join("AGENTS.md")),
        ("skill.md", ws.join("skills/oculus-studio/SKILL.md")),
        ("thread.ndjson", ws.join("threads/12.ndjson")),
        ("claude.json", ws.join(".claude/settings.json")),
        ("memories", ws.join("memories")),
        ("db", root.join(".oculus/oculus.db")),
        ("vault", root.join(".oculus/vault.bin")),
        ("own.md", root.join("courses/COMP30026/notes.md")),
        ("passwd", "/etc/passwd".into()),
        // Even to a file that is savable itself.
        ("dfa-again.svg", outputs.join("dfa.svg")),
    ] {
        symlink(&to, outputs.join(link)).unwrap();
    }
    for inner in [
        "outputs/memory.md",
        "outputs/taste.md",
        "outputs/agents.md",
        "outputs/skill.md",
        "outputs/thread.ndjson",
        "outputs/claude.json",
        "outputs/memories/explain-plainly.md",
        "outputs/db",
        "outputs/vault",
        "outputs/own.md",
        "outputs/passwd",
        "outputs/dfa-again.svg",
    ] {
        assert!(!ok(&root, inner), "{inner}");
    }
}

#[test]
fn a_second_name_for_the_agents_file_is_refused() {
    let root = library("savable-hard");
    let ws = root.join(WS);
    std::fs::hard_link(ws.join("TASTE.md"), ws.join("outputs/taste-copy.md")).unwrap();
    assert!(!ok(&root, "outputs/taste-copy.md"));
}

#[test]
fn a_linked_workspace_is_refused() {
    let root = library("savable-linked-ws");
    let elsewhere = Scratch::new("savable-elsewhere");
    write(&elsewhere.join("outputs/x.png"), "png");
    std::fs::rename(root.join(WS), root.join(".oculus/agents-real")).unwrap();
    symlink(&*elsewhere, root.join(WS)).unwrap();
    assert!(!ok(&root, "outputs/x.png"));
}

#[test]
fn nothing_outside_the_workspace_is_savable() {
    let root = library("savable-outside");
    for rel in [
        ".oculus/oculus.db",
        ".oculus/vault.bin",
        "courses/COMP30026/notes.md",
        "Receipts/march.pdf",
        "/etc/passwd",
        // The old spelling: the frontend maps it before asking.
        "agents/outputs/dfa.svg",
        "",
        WS,
    ] {
        assert!(savable(&root, rel).is_none(), "{rel}");
    }
}

#[test]
fn a_file_swapped_for_a_link_after_the_answer_reads_nothing() {
    let root = library("savable-swap");
    let ws = root.join(WS);
    let resolved = savable(&root, &format!("{WS}/outputs/dfa.svg")).unwrap();
    std::fs::remove_file(ws.join("outputs/dfa.svg")).unwrap();
    symlink(ws.join("TASTE.md"), ws.join("outputs/dfa.svg")).unwrap();
    assert!(resolved.read().is_err());
}
