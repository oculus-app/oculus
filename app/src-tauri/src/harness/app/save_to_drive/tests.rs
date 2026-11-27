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

#[tokio::test]
async fn a_folder_of_no_subject_oculus_knows_is_refused_before_anything_is_written() {
    let root = library("save-home");
    std::fs::create_dir_all(root.join("courses/GONE10001/Notes")).unwrap();
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    for migration in crate::db::migrations::all() {
        sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
    }
    sqlx::query("INSERT INTO subjects (id, code, name) VALUES (1, 'COMP30026', 'Models')")
        .execute(&pool)
        .await
        .unwrap();

    for known in ["", "courses/COMP30026/Diagrams"] {
        assert!(known_home(&root, &pool, known).await.is_ok(), "{known:?}");
    }
    let error = known_home(&root, &pool, "courses/GONE10001/Notes")
        .await
        .unwrap_err();
    assert!(error.contains("no subject Oculus knows"), "{error}");
    assert_eq!(
        std::fs::read_dir(root.join("courses/GONE10001/Notes"))
            .unwrap()
            .count(),
        0
    );
}
