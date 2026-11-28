//! One run on a used library: what is at the top afterwards, where
//! everything went, and what was rewritten.

use super::fixture::{block, env, exists, library, open, read, top, FakeBroker, CODE, NOT_OURS};
use crate::library::migrate::state::{at_startup, is_done, run, Outcome, DONE};
use crate::library::paths::db_path;
use crate::test_support::Scratch;

fn moved(outcome: Outcome) -> crate::library::migrate::state::Summary {
    match outcome {
        Outcome::Moved(summary) => summary,
        other => panic!("{other:?}"),
    }
}

#[test]
fn one_run_leaves_the_library_the_record_and_the_state_folder_at_the_top() {
    let dir = library("state-move");
    let broker = FakeBroker::default();
    let summary = moved(run(&dir, &env(&broker)).unwrap());
    assert!(!summary.resumed);

    let mut want: Vec<String> = [".library-move", ".oculus", "courses"]
        .iter()
        .chain(NOT_OURS.iter())
        .map(|name| name.to_string())
        .collect();
    want.sort();
    assert_eq!(top(&dir), want);

    for rel in [
        "oculus.db",
        "vault.bin",
        "vault.bin.lock",
        "canvas-session/authenticated",
        "okta-sign-in.log",
        "institution.json",
        "ed-courses.json",
        "file-manifest.json",
        "mineru-usage.json",
        "voyage-usage.json",
        "models/whisper/ggml-base.bin",
        "studio/videos/bayes/video.json",
        "whiteboard-pages/7/pages.json",
        "recovery/whiteboards/7.json",
        "downloads/.incoming",
        "agents/attachments/20261120-063301-0a1b2c3d.png",
    ] {
        assert!(exists(&dir, &format!(".oculus/{rel}")), "{rel}");
    }
    // What was not the app's is where it was, untouched.
    assert_eq!(read(&dir, "notes.txt"), "the student's");
    assert_eq!(read(&dir, "lectures/abc/video.mp4"), "video");
    assert_eq!(read(&dir, "courses/loose.pdf"), "%PDF");
    assert_eq!(
        read(&dir, &format!("courses/{CODE}/Course/Files/a.pdf")),
        "%PDF"
    );
    // The old install folder and its socket are removed, not moved.
    assert!(!exists(&dir, ".oculus/bin"));
    assert!(!exists(&dir, ".oculus/keyd.sock"));
}

#[test]
fn the_database_opens_from_its_new_place_with_its_rows_and_the_old_path_rules() {
    let dir = library("state-move-db");
    let broker = FakeBroker::default();
    let summary = moved(run(&dir, &env(&broker)).unwrap());
    assert_eq!(summary.path_moves, 3);
    block(async {
        let pool = open(&db_path(&dir)).await;
        let kept: String = sqlx::query_scalar("SELECT value FROM settings WHERE key = 'probe'")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(kept, "kept");
        let moves: Vec<(String, String)> =
            sqlx::query_as("SELECT old_prefix, new_prefix FROM path_moves ORDER BY old_prefix")
                .fetch_all(&pool)
                .await
                .unwrap();
        let want = [
            ("agents", ".oculus/agents"),
            (
                "courses/COMP1_2026/files",
                "courses/COMP1_2026/Course/Files",
            ),
            ("studio", ".oculus/studio"),
            ("whiteboard-pages", ".oculus/whiteboard-pages"),
        ];
        let got: Vec<(&str, &str)> = moves.iter().map(|(o, n)| (&**o, &**n)).collect();
        assert_eq!(got, want);
        let old = "agents/attachments/20261120-063301-0a1b2c3d.png";
        let resolved = crate::library::migrate::resolve_moved(&pool, old)
            .await
            .unwrap();
        assert_eq!(resolved.as_deref(), Some(&*format!(".oculus/{old}")));
        pool.close().await;
    });
}

#[cfg(unix)]
#[test]
fn each_subject_loses_its_root_link_and_keeps_its_memories() {
    let dir = library("state-move-links");
    let broker = FakeBroker::default();
    let summary = moved(run(&dir, &env(&broker)).unwrap());
    assert_eq!(summary.links, 1);

    let subject = format!("courses/{CODE}");
    assert!(!exists(&dir, &format!("{subject}/AGENTS.md")));
    let link = dir.join(format!("{subject}/.oculus/agents/memories"));
    assert_eq!(
        std::fs::read_link(&link).unwrap(),
        std::path::Path::new("../../../../.oculus/agents/memories").join(CODE)
    );
    assert_eq!(
        std::fs::read_to_string(link.join("MEMORY.md")).unwrap(),
        "# mine\n"
    );
    // A real file there is the student's.
    assert_eq!(read(&dir, "courses/OWN_2026/AGENTS.md"), "mine");
    // The docs are written again where the workspace is now.
    assert_eq!(
        read(&dir, ".oculus/agents/AGENTS.md"),
        crate::agents::AGENTS_DOC
    );
    assert!(exists(&dir, ".oculus/agents/.claude/skills"));

    let subjects: Vec<String> = std::fs::read_dir(dir.join(&subject))
        .unwrap()
        .map(|e| e.unwrap().file_name().into_string().unwrap())
        .filter(|name| !name.starts_with('.'))
        .collect();
    assert_eq!(subjects.len(), 2, "{subjects:?}");
    assert!(subjects.contains(&"Course".to_string()) && subjects.contains(&"notes.md".to_string()));
}

#[test]
fn the_broker_stops_before_the_vault_moves_and_starts_after() {
    let dir = library("state-move-broker");
    let broker = FakeBroker::default();
    run(&dir, &env(&broker)).unwrap();
    assert_eq!(
        broker.calls(),
        ["stop top=true moved=false", "start top=false moved=true"]
    );
    assert!(!exists(&dir, "bin"), "the old install folder is removed");
    assert!(!exists(&dir, "keyd.sock"), "and the old socket");

    // Done: a second launch asks the broker nothing.
    assert_eq!(run(&dir, &env(&broker)).unwrap(), Outcome::AlreadyDone);
    assert_eq!(broker.calls().len(), 2);
    assert!(is_done(&dir));
    at_startup(&dir).unwrap();
}

#[test]
fn an_old_install_folder_holding_something_else_is_left() {
    let dir = library("state-move-bin");
    std::fs::write(dir.join("bin/mine.sh"), "#!/bin/sh").unwrap();
    run(&dir, &env(&FakeBroker::default())).unwrap();
    assert_eq!(read(&dir, "bin/mine.sh"), "#!/bin/sh");
    assert!(!exists(&dir, "bin/Oculus Helper.app"));
    assert!(!exists(&dir, "bin/oculus-keyd.stamp"));
}

#[test]
fn a_new_install_gets_the_state_folder_and_the_guard_without_a_broker_call() {
    let dir = Scratch::new("state-move-new");
    let broker = FakeBroker::default();
    assert_eq!(run(&dir, &env(&broker)).unwrap(), Outcome::NothingToMove);
    assert!(broker.calls().is_empty());
    assert_eq!(top(&dir), [".library-move", ".oculus"]);
    assert_eq!(read(&dir, ".library-move/done"), DONE);
    assert!(read(&dir, ".library-move/journal.json").contains("\"format\": 2"));
}

/// A library from before the Drive tree: the state move goes first, and the
/// Drive move and the whiteboard rename then run on the new paths.
#[test]
fn a_library_from_before_the_drive_move_goes_through_all_three_moves() {
    use crate::library::migrate::tests::fixture as old;

    let dir = old::library_at_the_top("state-move-then-drive");
    assert!(exists(&dir, "oculus.db") && exists(&dir, "canvas-pages/14/pages.json"));
    assert!(!exists(&dir, ".library-move/done") && !exists(&dir, ".oculus"));

    let broker = FakeBroker::default();
    moved(run(&dir, &env(&broker)).unwrap());
    assert!(exists(&dir, ".oculus/oculus.db") && !exists(&dir, "oculus.db"));
    assert!(exists(&dir, ".oculus/canvas-pages/14/pages.json"));
    assert!(!crate::library::migrate::journal::is_done(&dir));

    crate::library::migrate::at_startup(&dir).unwrap();
    assert!(crate::library::migrate::journal::is_done(&dir));
    assert_eq!(read(&dir, ".library-move/done"), DONE);
    assert!(exists(&dir, &format!("{}/Course/Files/lec1.pdf", old::S)));
    assert!(exists(&dir, ".oculus/whiteboard-pages/14/pages.json"));
    assert!(!exists(&dir, ".oculus/canvas-pages"));
    assert!(!exists(&dir, "whiteboard-pages") && !exists(&dir, "canvas-pages"));
    // Its journal never took the name older builds read.
    assert!(read(&dir, ".library-move/journal.json").contains("\"format\": 2"));
    assert!(exists(&dir, ".library-move/journal.drive.json"));
}

/// Start over's marker as an earlier build left it, at the top: the move
/// carries it into the state folder, and the cleanup that follows at launch
/// honours it there, keeping what it keeps under the new paths.
#[test]
fn a_start_over_asked_for_before_the_update_still_happens_after_the_move() {
    let dir = library("state-move-start-over");
    std::fs::write(dir.join("start-over"), b"1").unwrap();
    run(&dir, &env(&FakeBroker::default())).unwrap();
    assert!(!exists(&dir, "start-over") && exists(&dir, ".oculus/start-over"));

    crate::library::storage::finish_start_over(&dir);
    let mut want: Vec<String> = [".library-move", ".oculus"]
        .iter()
        .chain(NOT_OURS.iter())
        .map(|name| name.to_string())
        .collect();
    want.sort();
    // Start over empties the data dir, the library and what else is at the top.
    want.retain(|name| name.starts_with(".library-move") || name == ".oculus");
    assert_eq!(top(&dir), want);
    assert!(!exists(&dir, ".oculus/start-over") && !exists(&dir, ".oculus/oculus.db"));
    for kept in [
        "vault.bin",
        "vault.bin.lock",
        "models/whisper/ggml-base.bin",
        "mineru-usage.json",
        "voyage-usage.json",
    ] {
        assert!(exists(&dir, &format!(".oculus/{kept}")), "{kept}");
    }
    assert_eq!(read(&dir, ".library-move/done"), DONE);
}
