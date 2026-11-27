//! A run cut short resumes from the journal and ends where an uninterrupted
//! run does; a rename that fails leaves the guard, names the journal, and
//! never a fresh database.

use std::path::Path;

use super::fixture::{env, exists, library, read, snapshot, FakeBroker};
use crate::library::migrate::state::{run, Env, Hooks, Outcome, MOVING, STOPPED};

/// Everything a finished run leaves, but the record's own files.
fn settled(dir: &Path) -> Vec<String> {
    let mut lines = snapshot(dir);
    lines.retain(|line| !line.starts_with(".library-move/"));
    lines
}

fn hooked<'a>(broker: &'a FakeBroker, hooks: Hooks) -> Env<'a> {
    Env {
        allowed: true,
        broker,
        hooks,
    }
}

#[test]
fn a_run_killed_after_any_rename_finishes_on_the_next_launch() {
    let whole = library("state-move-whole");
    run(&whole, &env(&FakeBroker::default())).unwrap();
    let want = settled(&whole);

    for stop_after in [0, 1, 4, 9, 15] {
        let dir = library("state-move-killed");
        let broker = FakeBroker::default();
        let hooks = Hooks {
            stop_after: Some(stop_after),
            fail_at: None,
        };
        let error = run(&dir, &hooked(&broker, hooks)).unwrap_err();
        assert!(error.starts_with(STOPPED), "{error}");
        assert_eq!(read(&dir, ".library-move/done"), MOVING);
        assert_eq!(exists(&dir, ".oculus/oculus.db"), stop_after > 0);
        assert!(
            exists(&dir, "agents"),
            "the last to move is still at the top"
        );

        match run(&dir, &env(&broker)).unwrap() {
            Outcome::Moved(summary) => assert!(summary.resumed),
            other => panic!("{other:?}"),
        }
        assert_eq!(settled(&dir), want, "stopped after {stop_after}");
    }
}

#[test]
fn a_failed_rename_refuses_and_names_the_journal_and_no_database_is_made() {
    let dir = library("state-move-failed");
    let broker = FakeBroker::default();
    // The database and the vault land; the fourth rename fails.
    let hooks = Hooks {
        stop_after: None,
        fail_at: Some(3),
    };
    let journal = dir.join(".library-move/journal.json");
    let error = run(&dir, &hooked(&broker, hooks.clone())).unwrap_err();
    assert!(error.contains("test hook"), "{error}");
    assert!(error.contains(&journal.display().to_string()), "{error}");
    assert_eq!(read(&dir, ".library-move/done"), MOVING);
    assert!(exists(&dir, ".oculus/oculus.db") && exists(&dir, ".oculus/vault.bin"));

    // The next start meets the same failure: it refuses again, and nothing
    // stands in for the database at the top.
    let error = run(
        &dir,
        &hooked(
            &broker,
            Hooks {
                fail_at: Some(0),
                ..hooks
            },
        ),
    )
    .unwrap_err();
    assert!(error.contains(&journal.display().to_string()), "{error}");
    assert!(!exists(&dir, "oculus.db") && !exists(&dir, "vault.bin"));
    assert!(exists(&dir, "agents"));

    assert!(matches!(
        run(&dir, &env(&broker)).unwrap(),
        Outcome::Moved(_)
    ));
    assert!(!exists(&dir, "agents") && exists(&dir, ".oculus/agents"));
}

#[test]
fn a_broker_that_will_not_stop_leaves_everything_where_it_was_behind_the_guard() {
    let dir = library("state-move-broker-refused");
    let broker = FakeBroker {
        refuse_stop: true,
        ..FakeBroker::default()
    };
    let error = run(&dir, &env(&broker)).unwrap_err();
    assert!(error.contains("launchd refused"), "{error}");
    assert!(exists(&dir, "vault.bin") && exists(&dir, "oculus.db"));
    assert!(!exists(&dir, ".oculus/vault.bin"));
    assert_eq!(read(&dir, ".library-move/done"), MOVING);
}
