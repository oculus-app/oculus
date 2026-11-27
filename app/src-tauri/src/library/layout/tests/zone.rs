use crate::library::layout::{
    home_of, in_library, is_home_root, reserved_name, reserved_names, reserved_top_name, zone_of,
    Home, Zone,
};

#[test]
fn every_path_shape_has_its_zone() {
    let cases = [
        ("courses/X/Course/Files/a.pdf", Zone::Synced),
        ("courses/X/Course/Files/.hidden", Zone::Synced),
        ("courses/X/Course/home.md", Zone::Synced),
        ("courses/X/Course/Lessons/1-l/03-q1a/q1a.py", Zone::Synced),
        (
            "courses/X/Course/Recordings/2026-08-04-mo-l105/source1.mp4",
            Zone::Synced,
        ),
        ("courses/X/Course/something-new/a.md", Zone::Synced),
        ("courses/X/Course", Zone::Synced),
        ("courses", Zone::Synced),
        ("courses/X", Zone::Synced),
        ("courses/X/a.pdf", Zone::Own),
        ("courses/X/Exam prep", Zone::Own),
        ("courses/X/Exam prep/deep/er/notes.md", Zone::Own),
        ("courses/X/board.whiteboard", Zone::Own),
        ("courses/X/.assets/p.png", Zone::Own),
        ("courses/X/.oculus/agents/INSTRUCTIONS.md", Zone::Hidden),
        ("courses/X/.oculus/agents/memories/m.md", Zone::Hidden),
        (
            "courses/X/.oculus/derived/Course/Files/a.pages.json",
            Zone::Hidden,
        ),
        ("Videos", Zone::Own),
        ("Videos/Raw/talk.mp4", Zone::Own),
        ("timetable.png", Zone::Own),
        ("Course/a.pdf", Zone::Own),
        (".oculus", Zone::Hidden),
        (".oculus/agents/memories/x.md", Zone::Hidden),
        (".oculus/studio/videos/a/video.json", Zone::Hidden),
        (".oculus/oculus.db", Zone::Hidden),
        (".oculus/derived/Videos/a.pages.json", Zone::Hidden),
        (".library-move/done", Zone::Hidden),
        (".assets/p.png", Zone::Own),
        (".Assets", Zone::Own),
        (".assets-old/p.png", Zone::Hidden),
        (".DS_Store", Zone::Hidden),
    ];
    for (rel, zone) in cases {
        assert_eq!(zone_of(rel), zone, "{rel}");
    }
}

#[test]
fn folder_names_ignore_case_as_the_filesystem_does() {
    assert_eq!(zone_of("courses/X/course/files/a.pdf"), Zone::Synced);
    assert_eq!(zone_of("Courses/X/COURSE/home.md"), Zone::Synced);
    assert_eq!(zone_of("courses/X/.OCULUS/agents/x.md"), Zone::Hidden);
    assert_eq!(zone_of("courses/X/Courses/a.pdf"), Zone::Own);
}

#[test]
fn course_and_oculus_are_reserved_at_a_subjects_root() {
    for name in ["Course", "course", "COURSE", ".oculus", ".Oculus"] {
        assert!(reserved_name(name), "{name}");
    }
    for name in ["Courses", "My Course", "oculus", "Exam prep"] {
        assert!(!reserved_name(name), "{name}");
    }
    assert_eq!(reserved_names(), ["Course", ".oculus"]);
    for name in reserved_names() {
        assert_ne!(
            zone_of(&format!("courses/X/{name}/a")),
            Zone::Own,
            "{name} is not the student's"
        );
    }
}

#[test]
fn any_spelling_that_could_leave_the_data_dir_is_outside() {
    for rel in [
        "",
        "/etc/passwd",
        "..",
        "../oculus.db",
        "./courses/X/Course/Files/a.pdf",
        "courses/../oculus.db",
        "courses/X/Exam prep/../../../oculus.db",
        "courses/X/Exam prep/..",
        "courses//Exam prep/x",
        "courses/X/Course/Files/",
        r"courses\X\Course\Files\a.pdf",
        r"courses/X/Exam prep/..\..\oculus.db",
        "C:/Windows/win.ini",
        "C:x",
        "courses/X/Exam prep/a\0.pdf",
    ] {
        assert_eq!(zone_of(rel), Zone::Outside, "{rel:?}");
    }
}

#[test]
fn unicode_names_are_ordinary_names() {
    // NFC and NFD spellings of the same name; neither is normalised away.
    assert_eq!(zone_of("courses/X/Übung.pdf"), Zone::Own);
    assert_eq!(zone_of("courses/X/U\u{308}bung.pdf"), Zone::Own);
    assert_eq!(zone_of("courses/数学/Course/Files/讲义.pdf"), Zone::Synced);
}

/// The top level's rule is one line: a dot-name is the app's, `courses` is
/// the folder of subjects, anything else is the student's. No list of names.
#[test]
fn nothing_at_the_top_level_is_hidden_by_its_name() {
    for name in [
        "agents", "studio", "models", "lectures", "bin", "Oculus", "tmp",
    ] {
        assert_eq!(zone_of(name), Zone::Own, "{name}");
        assert_eq!(zone_of(&format!("{name}/x")), Zone::Own, "{name}");
        assert!(!reserved_top_name(name), "{name}");
    }
    for name in ["courses", "Courses", "COURSES"] {
        assert_eq!(zone_of(name), Zone::Synced, "{name}");
        assert!(reserved_top_name(name), "{name}");
    }
}

#[test]
fn a_path_is_in_a_subject_or_at_the_top_level() {
    assert_eq!(home_of(""), Some(Home::TopLevel));
    assert_eq!(home_of("Videos/Raw/talk.mp4"), Some(Home::TopLevel));
    assert_eq!(home_of("timetable.png"), Some(Home::TopLevel));
    assert_eq!(home_of("courses/X"), Some(Home::Subject("X")));
    assert_eq!(home_of("Courses/X/Notes/a.md"), Some(Home::Subject("X")));
    for rel in [
        "courses",
        ".oculus",
        ".oculus/agents",
        "courses/.x/a.md",
        "../x",
        "/abs",
        "a//b",
    ] {
        assert_eq!(home_of(rel), None, "{rel}");
    }
    assert!(is_home_root("") && is_home_root("courses/X"));
    assert!(!is_home_root("Videos") && !is_home_root("courses") && !is_home_root("courses/X/N"));
}

#[test]
fn the_library_is_the_subjects_and_the_students_top_level() {
    for rel in [
        "courses/X/Course/Files/a.pdf",
        "courses/X/a.pdf",
        "Videos/a.mp4",
        "a.pdf",
    ] {
        assert!(in_library(rel), "{rel}");
    }
    for rel in [
        "",
        ".oculus/oculus.db",
        ".oculus/agents/a.pdf",
        "../a.pdf",
        "/etc/passwd",
    ] {
        assert!(!in_library(rel), "{rel}");
    }
}
