//! The move refuses, having changed nothing: another process has the
//! database open, a target is taken, or a debug build was not told to move.

use super::fixture::{block, env, exists, library, open, read, snapshot, top, FakeBroker};
use crate::library::migrate::state::{allowed, run, Env, Hooks, Outcome, ALLOW_ENV, NOT_ALONE};
use crate::test_support::Scratch;

#[test]
fn another_connection_on_the_database_stops_the_move_before_anything_changes() {
    let dir = library("state-move-busy");
    let before = snapshot(&dir);
    let broker = FakeBroker::default();
    block(async {
        // An app with its pool open and idle.
        let holder = open(&dir.join("oculus.db")).await;
        let _: i64 = sqlx::query_scalar("SELECT count(*) FROM settings")
            .fetch_one(&holder)
            .await
            .unwrap();

        let error = run(&dir, &env(&broker)).unwrap_err();
        assert!(error.starts_with(NOT_ALONE), "{error}");
        assert_eq!(snapshot(&dir), before, "nothing moved, no guard written");
        assert_eq!(read(&dir, ".library-move/done"), "drive");
        assert!(read(&dir, ".library-move/journal.json").contains("\"format\":1"));
        assert!(!exists(&dir, ".oculus"));
        assert!(broker.calls().is_empty(), "the broker was never stopped");
        holder.close().await;
    });

    // Alone again, the same launch moves it.
    assert!(matches!(
        run(&dir, &env(&broker)).unwrap(),
        Outcome::Moved(_)
    ));
}

#[test]
fn a_target_that_already_exists_is_an_error_naming_both_paths_and_never_a_merge() {
    let dir = library("state-move-taken");
    // What a build's `docs` or `keyd install` would leave if it ran first.
    std::fs::create_dir_all(dir.join(".oculus/agents")).unwrap();
    std::fs::write(dir.join(".oculus/agents/OCULUS.md"), "new").unwrap();
    let before = snapshot(&dir);
    let broker = FakeBroker::default();

    let error = run(&dir, &env(&broker)).unwrap_err();
    assert!(
        error.contains(&dir.join("agents").display().to_string()),
        "{error}"
    );
    assert!(
        error.contains(&dir.join(".oculus/agents").display().to_string()),
        "{error}"
    );
    assert!(error.contains("never merges"), "{error}");
    assert_eq!(snapshot(&dir), before);
    assert_eq!(read(&dir, ".library-move/done"), "drive");
    assert_eq!(read(&dir, "agents/AGENTS.md"), "stale");
    assert_eq!(read(&dir, ".oculus/agents/OCULUS.md"), "new");
    assert!(broker.calls().is_empty());
}

#[test]
fn a_debug_build_moves_only_when_told_to() {
    assert!(allowed(false, None), "a release always moves");
    assert!(allowed(true, Some("1")));
    assert!(!allowed(true, None));
    assert!(!allowed(true, Some("0")));
    assert!(!allowed(true, Some("")));

    let dir = library("state-move-gate");
    // No lock file yet: taking it would be a change.
    assert!(!exists(&dir, ".library-move/lock"));
    let before = snapshot(&dir);
    let broker = FakeBroker::default();
    let untold = Env {
        allowed: false,
        broker: &broker,
        hooks: Hooks::default(),
    };
    let error = run(&dir, &untold).unwrap_err();
    assert!(error.contains(&format!("{ALLOW_ENV}=1")), "{error}");
    assert!(error.contains("Nothing was changed"), "{error}");
    assert_eq!(snapshot(&dir), before);
    assert!(broker.calls().is_empty());

    // A move another build started is not picked up either.
    std::fs::write(dir.join(".library-move/done"), "state-moving").unwrap();
    let before = snapshot(&dir);
    assert!(run(&dir, &untold).unwrap_err().contains(ALLOW_ENV));
    assert_eq!(snapshot(&dir), before);
}

#[test]
fn a_new_install_needs_no_telling() {
    let dir = Scratch::new("state-move-gate-new");
    let broker = FakeBroker::default();
    let untold = Env {
        allowed: false,
        broker: &broker,
        hooks: Hooks::default(),
    };
    assert_eq!(run(&dir, &untold).unwrap(), Outcome::NothingToMove);
    assert_eq!(top(&dir), [".library-move", ".oculus"]);
    // Nor does a library that has moved.
    assert_eq!(run(&dir, &untold).unwrap(), Outcome::AlreadyDone);
}

#[test]
fn a_library_a_newer_version_arranged_is_refused() {
    let dir = Scratch::new("state-move-newer");
    std::fs::create_dir_all(dir.join(".library-move")).unwrap();
    std::fs::write(dir.join(".library-move/done"), "later").unwrap();
    let error = run(&dir, &env(&FakeBroker::default())).unwrap_err();
    assert!(
        error.contains("`later`") && error.contains("newer version"),
        "{error}"
    );
    assert!(!exists(&dir, ".oculus"));
}
