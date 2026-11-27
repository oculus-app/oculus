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
fn only_the_installed_app_moves_untold() {
    let bundled = std::path::Path::new("/Applications/Oculus.app/Contents/MacOS/oculus");
    let debug = std::path::Path::new("/src/oculus/app/src-tauri/target/debug/oculus");
    let release = std::path::Path::new("/src/oculus/app/src-tauri/target/release/oculus");
    let debug_app = std::path::Path::new("/src/oculus/app/src-tauri/target/debug/app");
    if cfg!(not(windows)) {
        assert!(allowed(bundled, None), "the installed app moves on its own");
        assert!(allowed(bundled, Some("1")));
    }
    for unbundled in [debug, release, debug_app] {
        assert!(!allowed(unbundled, None), "{}", unbundled.display());
        assert!(!allowed(unbundled, Some("0")), "{}", unbundled.display());
        assert!(!allowed(unbundled, Some("")), "{}", unbundled.display());
        assert!(allowed(unbundled, Some("1")), "{}", unbundled.display());
    }
}

/// `cli:install` links `~/.local/bin/oculus` to the release build: the link
/// is the build, not the app. A link to the app's own binary is the app.
#[cfg(unix)]
#[test]
fn a_link_is_judged_by_the_binary_it_names() {
    let dir = Scratch::new("state-move-gate-links");
    let write = |rel: &str| {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "bin").unwrap();
        path
    };
    let release = write("app/src-tauri/target/release/oculus");
    let app = write("Applications/Oculus.app/Contents/MacOS/oculus");
    std::fs::create_dir_all(dir.join("bin")).unwrap();
    std::os::unix::fs::symlink(&release, dir.join("bin/oculus")).unwrap();
    std::os::unix::fs::symlink(&app, dir.join("bin/oculus-app")).unwrap();
    assert!(!allowed(&dir.join("bin/oculus"), None));
    assert!(allowed(&dir.join("bin/oculus-app"), None));
}

#[test]
fn an_untold_build_refuses_having_changed_nothing() {
    let dir = library("state-move-gate");
    // No lock file yet: taking it would be a change.
    assert!(!exists(&dir, ".library-move/lock"));
    let before = snapshot(&dir);
    let broker = FakeBroker::default();
    let untold = Env {
        allowed: false,
        broker: &broker,
        running: Vec::new,
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
        running: Vec::new,
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

/// A binary that moved a library but ships no keyd says so, and who will
/// register it; the installed app's ships one and registers it itself.
#[cfg(unix)]
#[test]
fn a_move_with_no_keyd_to_register_says_who_will() {
    use crate::library::migrate::state::broker::unregistered;
    let dir = Scratch::new("state-move-keyd-note");
    let release = dir.join("target/release/oculus");
    let line = unregistered(&release, false).expect("a build tree's binary ships none");
    assert!(line.contains("installed Oculus app registers it"), "{line}");

    let exe = dir.join("Oculus.app/Contents/MacOS/oculus");
    let helper = keyd_core::paths::bundled_program(&exe).unwrap();
    std::fs::create_dir_all(helper.parent().unwrap()).unwrap();
    std::fs::write(&helper, "keyd").unwrap();
    assert_eq!(unregistered(&exe, false), None);
    assert!(
        unregistered(&exe, true).is_some(),
        "a debug app leaves it to the preflight"
    );
}

fn running(pid: u32, parent: u32, exe: &str) -> crate::library::migrate::state::Running {
    crate::library::migrate::state::Running {
        pid,
        parent,
        exe: exe.into(),
    }
}

/// An app idle past its pool's timeout holds no connection: the SQLite
/// probe would pass, so the process itself stops the move.
#[test]
fn another_running_oculus_stops_the_move_before_anything_changes() {
    let dir = library("state-move-running");
    let before = snapshot(&dir);
    let broker = FakeBroker::default();
    let with_app = Env {
        allowed: true,
        broker: &broker,
        running: || {
            vec![running(
                4242,
                1,
                "/Applications/Oculus.app/Contents/MacOS/Oculus",
            )]
        },
        hooks: Hooks::default(),
    };
    let error = run(&dir, &with_app).unwrap_err();
    assert!(error.starts_with(NOT_ALONE), "{error}");
    assert!(error.contains("Oculus.app"), "{error}");
    assert_eq!(snapshot(&dir), before, "nothing moved, no guard written");
    assert!(broker.calls().is_empty());
}

#[test]
fn the_app_and_the_cli_are_oculus_and_this_process_s_own_line_is_not() {
    use crate::library::migrate::state::others::{another_oculus, is_oculus};
    for exe in [
        "/Applications/Oculus.app/Contents/MacOS/Oculus",
        "/Applications/Oculus.app/Contents/MacOS/oculus",
        "/Users/me/.local/bin/oculus",
        "/src/oculus/app/src-tauri/target/debug/app",
        "/src/oculus/app/src-tauri/target/release/app",
        "C:/Program Files/WindowsApps/Oculus_1.0/Oculus.exe",
        "C:/src/oculus/app/src-tauri/target/debug/oculus.exe",
    ] {
        assert!(is_oculus(std::path::Path::new(exe)), "{exe}");
    }
    for exe in [
        "/Applications/Oculus.app/Contents/Helpers/Oculus Helper.app/Contents/MacOS/Oculus Helper",
        "/Applications/Safari.app/Contents/MacOS/Safari",
        "/usr/local/bin/app",
        "/src/other/target/debug/oculus-keyd",
        "/opt/homebrew/bin/opencode",
    ] {
        assert!(!is_oculus(std::path::Path::new(exe)), "{exe}");
    }

    // The app that ran this command (an agent's `oculus`), and its shell.
    let app = "/Applications/Oculus.app/Contents/MacOS/Oculus";
    let all = [
        running(1, 0, "/sbin/launchd"),
        running(10, 1, app),
        running(20, 10, "/bin/zsh"),
        running(30, 20, "/Users/me/.local/bin/oculus"),
    ];
    assert!(another_oculus(&all, 30).is_none());
    let mut more = all.to_vec();
    more.push(running(40, 1, "/Users/me/.local/bin/oculus"));
    assert_eq!(another_oculus(&more, 30).unwrap().pid, 40);
    assert_eq!(another_oculus(&all, 99).unwrap().pid, 10);
}

/// The platform's own list, read only: it finds this test process by its
/// executable and parent.
#[cfg(target_os = "macos")]
#[test]
fn the_process_list_finds_this_process() {
    let all = crate::library::migrate::state::others::list();
    let me = all
        .iter()
        .find(|p| p.pid == std::process::id())
        .expect("this process is listed");
    assert_eq!(
        me.exe.canonicalize().unwrap(),
        std::env::current_exe().unwrap().canonicalize().unwrap()
    );
    assert!(me.parent > 0);
}
