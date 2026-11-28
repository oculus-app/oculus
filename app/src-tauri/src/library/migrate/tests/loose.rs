//! Files loose in `courses/` move up to the top of the library: with what
//! parsing made of them, onto a free name, never over a file there, and
//! never a folder, a dot-name or a symlink. A crash mid-way resumes; a run
//! after the move changes nothing.

use std::path::Path;

use super::fixture::{block, exists, file, pool, read};
use crate::library::migrate::apply::STOPPED;
use crate::library::migrate::loose::{run, Outcome};
use crate::library::migrate::{resolve_moved, Hooks};
use crate::test_support::Scratch;

/// A Drive-tree library, its Drive move done, with files loose in `courses/`
/// and a top level that already holds one of their names.
fn loose_library(name: &str) -> Scratch {
    let d = Scratch::new(name);
    file(&d, ".library-move/done", "drive");
    file(&d, "courses/X/Course/Files/week1.pdf", "%PDF w1");
    file(&d, "courses/X/notes.md", "# mine");
    file(&d, "courses/cheatsheet.pdf", "%PDF loose");
    file(&d, "courses/cheatsheet.md", "# parsed");
    file(&d, "courses/cheatsheet.pages.json", r#"{"pages":[]}"#);
    file(&d, "courses/Exam Sheet.docx", "docx");
    file(&d, "courses/Exam Sheet.docx.pdf", "%PDF converted");
    file(&d, "courses/.DS_Store", "finder");
    file(
        &d,
        "courses/Spare/scan.pdf",
        "%PDF a subject-looking folder",
    );
    file(
        &d,
        "cheatsheet.pdf",
        "%PDF the student's own, already at the top",
    );
    #[cfg(unix)]
    std::os::unix::fs::symlink("X/notes.md", d.join("courses/link.md")).unwrap();
    d
}

fn moved(d: &Path) {
    // A name taken at the top takes a free one, and its text and record
    // follow it there.
    assert_eq!(
        read(d, "cheatsheet.pdf"),
        "%PDF the student's own, already at the top"
    );
    assert_eq!(read(d, "cheatsheet (2).pdf"), "%PDF loose");
    assert_eq!(read(d, "cheatsheet (2).md"), "# parsed");
    assert_eq!(
        read(d, ".oculus/derived/cheatsheet (2).pages.json"),
        r#"{"pages":[]}"#
    );
    assert_eq!(read(d, "Exam Sheet.docx"), "docx");
    assert_eq!(read(d, "Exam Sheet.docx.pdf"), "%PDF converted");
    for gone in [
        "courses/cheatsheet.pdf",
        "courses/cheatsheet.md",
        "courses/cheatsheet.pages.json",
        "courses/Exam Sheet.docx",
        "courses/Exam Sheet.docx.pdf",
    ] {
        assert!(!exists(d, gone), "{gone} moved");
    }
    // A subject, a dot-name, a folder and a symlink stay where they are.
    for kept in [
        "courses/X/notes.md",
        "courses/.DS_Store",
        "courses/Spare/scan.pdf",
    ] {
        assert!(exists(d, kept), "{kept} stays");
    }
    #[cfg(unix)]
    assert!(exists(d, "courses/link.md") && !exists(d, "link.md"));
}

#[test]
fn loose_files_move_to_the_top_onto_a_free_name_with_what_parsing_made() {
    let d = loose_library("loose-move");
    let Outcome::Moved { files, left, .. } = run(&d, &Hooks::default()).unwrap() else {
        panic!("moved");
    };
    assert_eq!(files, 5);
    assert!(left.is_empty(), "{left:?}");
    moved(&d);
    assert!(matches!(
        run(&d, &Hooks::default()).unwrap(),
        Outcome::AlreadyDone
    ));
}

#[test]
fn an_old_citation_of_a_loose_file_opens_it_at_the_top() {
    let d = loose_library("loose-path-moves");
    let db = block(pool(&d));
    block(crate::library::migrate::db::ensure(&db)).unwrap();
    block(db.close());
    run(&d, &Hooks::default()).unwrap();
    let db = block(pool(&d));
    for (old, new) in [
        ("courses/cheatsheet.pdf#page=2", "cheatsheet (2).pdf#page=2"),
        ("courses/cheatsheet.md:12", "cheatsheet (2).md:12"),
        ("courses/Exam Sheet.docx", "Exam Sheet.docx"),
    ] {
        assert_eq!(
            block(resolve_moved(&db, old)).unwrap().as_deref(),
            Some(new),
            "{old}"
        );
    }
    // The record went into app state, which no citation names.
    assert_eq!(
        block(resolve_moved(&db, "courses/cheatsheet.pages.json")).unwrap(),
        None
    );
}

#[test]
fn a_move_cut_short_resumes_where_it_stopped() {
    let d = loose_library("loose-resume");
    let stop = Hooks {
        stop_after: Some(2),
        ..Hooks::default()
    };
    assert_eq!(run(&d, &stop).unwrap_err(), STOPPED);
    assert!(exists(&d, "cheatsheet (2).pdf") || exists(&d, "Exam Sheet.docx"));
    let Outcome::Moved { resumed, .. } = run(&d, &Hooks::default()).unwrap() else {
        panic!("moved");
    };
    assert!(resumed);
    moved(&d);
}

#[test]
fn nothing_loose_or_no_courses_folder_is_nothing_to_move() {
    let d = Scratch::new("loose-none");
    file(&d, ".library-move/done", "drive");
    assert!(matches!(
        run(&d, &Hooks::default()).unwrap(),
        Outcome::NothingToMove
    ));
    assert!(matches!(
        run(&d, &Hooks::default()).unwrap(),
        Outcome::AlreadyDone
    ));
}

#[test]
fn the_move_waits_for_the_drive_move() {
    let d = Scratch::new("loose-waits");
    file(&d, "courses/a.pdf", "%PDF");
    assert!(run(&d, &Hooks::default()).is_err());
    assert!(exists(&d, "courses/a.pdf"));
}
