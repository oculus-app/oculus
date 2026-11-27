use super::*;
use crate::test_support::Scratch;

fn library(name: &str) -> Scratch {
    let root = Scratch::new(name);
    let ws = root.join(".oculus/agents");
    std::fs::create_dir_all(ws.join("outputs")).unwrap();
    std::fs::create_dir_all(ws.join("memories")).unwrap();
    std::fs::write(ws.join("outputs/dfa-even-zeros.svg"), "<svg/>").unwrap();
    std::fs::write(ws.join("memories/explain-plainly.md"), "memory").unwrap();
    std::fs::write(ws.join("TASTE.md"), "taste").unwrap();
    std::fs::create_dir_all(root.join("courses/COMP30026/Diagrams")).unwrap();
    std::fs::create_dir_all(root.join("courses/COMP30026/Course")).unwrap();
    root
}

#[test]
fn a_picture_is_copied_into_the_picked_folder() {
    let root = library("save-copy");
    let saved = save_copy(
        &root,
        ".oculus/agents/outputs/dfa-even-zeros.svg",
        "courses/COMP30026/Diagrams",
        None,
    )
    .unwrap();
    let file = saved.outcome.file.unwrap();
    assert_eq!(
        file.relative_path,
        "courses/COMP30026/Diagrams/dfa-even-zeros.svg"
    );
    assert_eq!(saved.stamp.size, 6);
    assert_eq!(
        std::fs::read(root.join(&file.relative_path)).unwrap(),
        b"<svg/>"
    );
    // At the top level, under the name the student gave.
    let top = save_copy(
        &root,
        ".oculus/agents/outputs/dfa-even-zeros.svg",
        "",
        Some(" even.svg "),
    )
    .unwrap();
    assert_eq!(top.outcome.file.unwrap().relative_path, "even.svg");
    // A typed name never leaves the picked folder.
    let typed = save_copy(
        &root,
        ".oculus/agents/outputs/dfa-even-zeros.svg",
        "courses/COMP30026/Diagrams",
        Some("../../../escape.svg"),
    )
    .unwrap();
    let rel = typed.outcome.file.unwrap().relative_path;
    let name = rel.strip_prefix("courses/COMP30026/Diagrams/").unwrap();
    assert!(!name.contains('/'), "{rel}");
    assert!(root.join(&rel).is_file(), "{rel}");
}

#[test]
fn the_agents_own_files_are_refused_and_nothing_lands() {
    let root = library("save-refused");
    let outputs = root.join(".oculus/agents/outputs");
    std::os::unix::fs::symlink(
        root.join(".oculus/agents/TASTE.md"),
        outputs.join("taste.md"),
    )
    .unwrap();
    for source in [
        ".oculus/agents/memories/explain-plainly.md",
        ".oculus/agents/TASTE.md",
        ".oculus/agents/outputs/../TASTE.md",
        ".oculus/agents/outputs/../memories/explain-plainly.md",
        ".oculus/agents/outputs/taste.md",
        ".oculus/oculus.db",
    ] {
        assert!(
            save_copy(&root, source, "courses/COMP30026/Diagrams", None).is_err(),
            "{source}"
        );
    }
    let landed = std::fs::read_dir(root.join("courses/COMP30026/Diagrams"))
        .unwrap()
        .count();
    assert_eq!(landed, 0);
}

#[test]
fn a_folder_the_student_cant_add_to_is_refused() {
    let root = library("save-target");
    for target in [
        "courses/COMP30026/Course",
        ".oculus/agents/outputs",
        "courses",
    ] {
        assert!(
            save_copy(
                &root,
                ".oculus/agents/outputs/dfa-even-zeros.svg",
                target,
                None
            )
            .is_err(),
            "{target}"
        );
    }
}
