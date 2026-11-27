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
