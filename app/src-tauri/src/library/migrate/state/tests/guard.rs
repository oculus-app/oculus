//! The guard against a build from before this move: what it reads first,
//! and that it refuses on what it finds.

use super::fixture::{env, library, read, FakeBroker};
use crate::library::migrate::journal as drive;
use crate::library::migrate::state::{run, Env, Hooks, DONE, MOVING};

/// What an older build does at launch: `done` is not `drive`, so it loads
/// `journal.json` with the reader this build still uses for the Drive
/// move's own journal.
fn an_older_build_refuses(dir: &std::path::Path) {
    assert_ne!(read(dir, ".library-move/done").trim(), drive::LAYOUT);
    let journal = dir.join(".library-move/journal.json");
    let error = drive::load_at(&journal).unwrap_err();
    assert!(
        error.ends_with("journal.json is from another version of Oculus (format 2)"),
        "{error}"
    );
}

#[test]
fn the_guard_is_written_before_the_first_rename_and_stays_for_good() {
    let dir = library("state-move-guard");
    let broker = FakeBroker::default();
    let stopped = Env {
        allowed: true,
        broker: &broker,
        running: Vec::new,
        hooks: Hooks {
            stop_after: Some(0),
            fail_at: None,
        },
    };
    run(&dir, &stopped).unwrap_err();
    assert!(dir.join("oculus.db").exists(), "nothing has moved yet");
    assert_eq!(read(&dir, ".library-move/done"), MOVING);
    let journal: serde_json::Value =
        serde_json::from_str(&read(&dir, ".library-move/journal.json")).unwrap();
    assert_eq!(journal["format"], 2);
    assert_eq!(journal["phase"], "moving");
    assert_eq!(journal["moves"][0]["from"], "oculus.db");
    assert_eq!(journal["moves"][0]["to"], ".oculus/oculus.db");
    an_older_build_refuses(&dir);

    run(&dir, &env(&broker)).unwrap();
    assert_eq!(read(&dir, ".library-move/done"), DONE);
    let journal: serde_json::Value =
        serde_json::from_str(&read(&dir, ".library-move/journal.json")).unwrap();
    assert_eq!(journal["format"], 2);
    assert_eq!(journal["phase"], "moved");
    an_older_build_refuses(&dir);
}

#[test]
fn the_finished_drive_move_keeps_its_journal_and_its_own_marker() {
    let dir = library("state-move-drive-record");
    let before = read(&dir, ".library-move/journal.json");
    run(&dir, &env(&FakeBroker::default())).unwrap();
    assert_eq!(read(&dir, ".library-move/journal.drive.json"), before);
    assert!(drive::is_done(&dir), "the Drive move is not run again");
    assert_eq!(read(&dir, ".library-move/whiteboard"), "done");
    crate::library::migrate::at_startup(&dir).unwrap();
}

/// From a Drive move an older build left half-done (`done` absent, a
/// format-1 `journal.json`), a kill between the Drive journal's copy and the
/// guard's own journal still leaves a `journal.json`: an older build resumes
/// that move instead of planning a fresh one over a half-moved library.
#[test]
fn a_kill_inside_the_guard_always_leaves_a_journal() {
    let dir = library("state-move-guard-kill");
    std::fs::remove_file(dir.join(".library-move/done")).unwrap();
    let before = read(&dir, ".library-move/journal.json");

    drive::step_aside(&dir).unwrap();
    // Killed here: the older journal is still where an older build reads it.
    assert_eq!(read(&dir, ".library-move/journal.json"), before);
    assert_eq!(read(&dir, ".library-move/journal.drive.json"), before);
    assert!(drive::load_at(&dir.join(".library-move/journal.json")).is_ok());

    // The next launch takes it from there.
    drive::step_aside(&dir).unwrap();
    run(&dir, &env(&FakeBroker::default())).unwrap();
    assert_eq!(read(&dir, ".library-move/journal.drive.json"), before);
    let journal: serde_json::Value =
        serde_json::from_str(&read(&dir, ".library-move/journal.json")).unwrap();
    assert_eq!(journal["format"], 2);
}
