//! The data dir's top level: the student's folders and files beside
//! `courses/`, their rows on the reserved row, and moves to and from a
//! subject. The scratch library has the app's state under `.oculus/`.

use super::*;
use crate::library::drive::ops::copy::copy_to_own_at;
use crate::library::drive::ops::create::create_folder_at;
use crate::library::drive::ops::delete::delete_entries_at;
use crate::library::drive::ops::error::Kind;
use crate::library::drive::ops::guard::{drive_target, own_entry, own_target};
use crate::library::drive::ops::moves::{move_entries_at, rename_entry_at};
use crate::library::drive::ops::reconcile::reconcile_own_files_at;
use crate::library::files::uploads::import_into;
use crate::library::layout::{derived_rel, DerivedKind, Home, TOP_LEVEL_CODE};

async fn paths_of(lib: &Lib, subject: i64) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT relative_path FROM files WHERE subject_id = ?1 ORDER BY relative_path",
    )
    .bind(subject)
    .fetch_all(&lib.pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn a_target_resolves_to_its_subject_or_none() {
    let lib = Lib::new("drive-top-target").await;
    lib.mkdir("Videos/Raw");
    lib.mkdir(&own(CODE, "Notes"));

    let top = drive_target(&lib.dir, "").unwrap();
    assert_eq!(
        (top.home(), top.child_rel("a.pdf").as_str()),
        (Home::TopLevel, "a.pdf")
    );
    assert_eq!(top.path, lib.path(""));
    let deep = drive_target(&lib.dir, "Videos/Raw").unwrap();
    assert_eq!(deep.home(), Home::TopLevel);
    assert_eq!(deep.child_rel("a.pdf"), "Videos/Raw/a.pdf");
    let subject = drive_target(&lib.dir, &own(CODE, "Notes")).unwrap();
    assert_eq!(subject.home(), Home::Subject(CODE));
    assert_eq!(
        drive_target(&lib.dir, &root(CODE)).unwrap().home(),
        Home::Subject(CODE)
    );

    assert_eq!(
        drive_target(&lib.dir, "courses").unwrap_err().kind,
        Kind::ReadOnly
    );
    assert_eq!(
        drive_target(&lib.dir, ".oculus").unwrap_err().kind,
        Kind::ReadOnly
    );
    assert_eq!(
        drive_target(&lib.dir, "Missing").unwrap_err().kind,
        Kind::NotFound
    );
    assert_eq!(
        drive_target(&lib.dir, "../x").unwrap_err().kind,
        Kind::InvalidName
    );

    assert_eq!(own_target(&lib.dir, TOP_LEVEL_CODE, None).unwrap().rel, "");
    assert_eq!(
        own_target(&lib.dir, TOP_LEVEL_CODE, Some("Videos"))
            .unwrap()
            .rel,
        "Videos"
    );
    assert!(own_target(&lib.dir, CODE, Some("Videos")).is_err());
    assert!(own_target(&lib.dir, TOP_LEVEL_CODE, Some(&own(CODE, "Notes"))).is_err());
    assert!(
        !lib.exists(&crate::library::layout::course_rel(TOP_LEVEL_CODE)),
        "the top-level code never makes a subject folder"
    );
}

#[tokio::test]
async fn folders_are_made_at_the_top_level_but_never_as_subjects() {
    let lib = Lib::new("drive-top-create").await;
    assert_eq!(create_folder_at(&lib.dir, "Videos").unwrap(), "Videos");
    assert_eq!(
        create_folder_at(&lib.dir, "Videos/Raw").unwrap(),
        "Videos/Raw"
    );
    assert_eq!(
        create_folder_at(&lib.dir, "Videos").unwrap_err().kind,
        Kind::Exists
    );
    assert_eq!(
        create_folder_at(&lib.dir, "Courses").unwrap_err().kind,
        Kind::InvalidName
    );
    assert_eq!(
        create_folder_at(&lib.dir, ".hidden").unwrap_err().kind,
        Kind::InvalidName
    );
    assert_eq!(
        create_folder_at(&lib.dir, "courses/NEW10001")
            .unwrap_err()
            .kind,
        Kind::ReadOnly,
        "no command makes a subject folder"
    );
    assert_eq!(
        create_folder_at(&lib.dir, ".oculus/mine").unwrap_err().kind,
        Kind::ReadOnly
    );
}

#[tokio::test]
async fn the_folder_of_subjects_and_app_state_cannot_be_renamed_moved_or_deleted() {
    let lib = Lib::new("drive-top-fixed").await;
    lib.put(".oculus/oculus.db", b"db");
    lib.mkdir("Videos");
    for rel in ["courses", &root(CODE), ".oculus", ".oculus/oculus.db"] {
        assert_eq!(
            own_entry(&lib.dir, rel).unwrap_err().kind,
            Kind::ReadOnly,
            "{rel}"
        );
        assert_eq!(
            rename_entry_at(&lib.dir, &lib.pool, rel, "Mine")
                .await
                .unwrap_err()
                .kind,
            Kind::ReadOnly,
            "{rel}"
        );
        assert_eq!(
            move_entries_at(&lib.dir, &lib.pool, &rels(&[rel]), "Videos")
                .await
                .unwrap_err()
                .kind,
            Kind::ReadOnly,
            "{rel}"
        );
        assert_eq!(
            delete_entries_at(&lib.dir, &lib.pool, &rels(&[rel]))
                .await
                .unwrap_err()
                .kind,
            Kind::ReadOnly,
            "{rel}"
        );
        assert!(lib.exists(rel), "{rel}");
    }
    assert_eq!(
        move_entries_at(&lib.dir, &lib.pool, &rels(&["Videos"]), "courses")
            .await
            .unwrap_err()
            .kind,
        Kind::ReadOnly,
        "nothing of the student's goes loose among the subjects"
    );
    assert_eq!(
        rename_entry_at(&lib.dir, &lib.pool, "Videos", "courses")
            .await
            .unwrap_err()
            .kind,
        Kind::InvalidName
    );
}

#[tokio::test]
async fn a_parsed_pdf_goes_subject_to_top_level_and_back_as_one_row() {
    let lib = Lib::new("drive-top-roundtrip").await;
    let start = own(CODE, "slides.pdf");
    let id = lib.parsed_pdf(&start).await;
    lib.mkdir("Videos");

    move_entries_at(&lib.dir, &lib.pool, &rels(&[&start]), "Videos")
        .await
        .unwrap();
    let top = "Videos/slides.pdf";
    let (subject, rel, _, _, category) = lib.row_of(id).await.unwrap();
    assert_eq!(
        (subject, rel.as_str(), category.as_str()),
        (TOP, top, "upload")
    );
    assert_eq!(lib.pages_of(id).await.len(), 1, "pages keep their file id");
    assert_eq!(
        derived_rel(top, DerivedKind::Pages),
        ".oculus/derived/Videos/slides.pages.json"
    );
    for kind in DerivedKind::ALL {
        assert!(lib.exists(&derived_rel(top, kind)), "{kind:?} came along");
        assert!(
            !lib.exists(&derived_rel(&start, kind)),
            "{kind:?} left nothing"
        );
    }

    move_entries_at(&lib.dir, &lib.pool, &rels(&[top]), "")
        .await
        .unwrap();
    let loose = "slides.pdf";
    assert_eq!(lib.row_of(id).await.unwrap().1, loose);
    assert_eq!(
        derived_rel(loose, DerivedKind::Embeddings),
        ".oculus/derived/slides.emb.json"
    );
    assert!(lib.exists(&derived_rel(loose, DerivedKind::Embeddings)));

    move_entries_at(&lib.dir, &lib.pool, &rels(&[loose]), &root(OTHER))
        .await
        .unwrap();
    let back = own(OTHER, "slides.pdf");
    let (subject, rel, ..) = lib.row_of(id).await.unwrap();
    assert_eq!(
        (subject, rel),
        (2, back.clone()),
        "the same row, in the subject"
    );
    assert_eq!(lib.pages_of(id).await.len(), 1);
    for kind in DerivedKind::ALL {
        assert!(lib.exists(&derived_rel(&back, kind)), "{kind:?} came back");
        assert!(
            !lib.exists(&derived_rel(loose, kind)),
            "{kind:?} left the top level"
        );
    }
    assert!(
        crate::parse::parse_mode(&lib.path(&back)).is_some(),
        "parsed, no re-parse needed"
    );
    assert_eq!(paths_of(&lib, TOP).await, Vec::<String>::new());
}

#[tokio::test]
async fn a_folder_moves_between_a_subject_and_the_top_level_with_every_row() {
    let lib = Lib::new("drive-top-folder-move").await;
    let note = lib.file(&own(CODE, "Exam/notes.md"), b"# n").await;
    let pdf = lib.parsed_pdf(&own(CODE, "Exam/Past/2024.pdf")).await;

    move_entries_at(&lib.dir, &lib.pool, &rels(&[&own(CODE, "Exam")]), "")
        .await
        .unwrap();
    assert_eq!(lib.row_of(note).await.unwrap().0, TOP);
    assert_eq!(lib.row_of(note).await.unwrap().1, "Exam/notes.md");
    assert_eq!(lib.row_of(pdf).await.unwrap().1, "Exam/Past/2024.pdf");
    assert!(
        lib.exists(".oculus/derived/Exam/Past/2024.pages.json"),
        "the mirror moved"
    );
    assert!(!lib.exists(&derived_rel(
        &own(CODE, "Exam/Past/2024.pdf"),
        DerivedKind::Pages
    )));

    rename_entry_at(&lib.dir, &lib.pool, "Exam", "Old exams")
        .await
        .unwrap();
    assert_eq!(lib.row_of(pdf).await.unwrap().1, "Old exams/Past/2024.pdf");
    assert_eq!(
        lib.row_of(pdf).await.unwrap().0,
        TOP,
        "a rename stays in its home"
    );
    assert!(lib.exists(".oculus/derived/Old exams/Past/2024.pages.json"));

    move_entries_at(&lib.dir, &lib.pool, &rels(&["Old exams"]), &root(CODE))
        .await
        .unwrap();
    assert_eq!(lib.row_of(pdf).await.unwrap().0, 1);
    assert_eq!(
        lib.row_of(pdf).await.unwrap().1,
        own(CODE, "Old exams/Past/2024.pdf")
    );
    assert_eq!(lib.pages_of(pdf).await.len(), 1);
    assert!(!lib.exists(".oculus/derived/Old exams"));
}

#[tokio::test]
async fn a_name_a_home_keeps_is_refused_where_it_lands() {
    let lib = Lib::new("drive-top-kept").await;
    // A fresh install has no folder of subjects yet; its name is kept anyway.
    std::fs::remove_dir_all(lib.path("courses")).unwrap();
    lib.mkdir("Elsewhere/courses");
    assert_eq!(
        move_entries_at(&lib.dir, &lib.pool, &rels(&["Elsewhere/courses"]), "")
            .await
            .unwrap_err()
            .kind,
        Kind::InvalidName,
        "the folder of subjects is never one of the student's"
    );
    let lib = Lib::new("drive-top-kept-course").await;
    lib.mkdir("Course");
    assert_eq!(
        move_entries_at(&lib.dir, &lib.pool, &rels(&["Course"]), &root(CODE))
            .await
            .unwrap_err()
            .kind,
        Kind::InvalidName
    );
}

#[tokio::test]
async fn an_old_app_folder_name_is_refused_to_new_entries_at_the_top_level() {
    let lib = Lib::new("drive-top-old-names").await;
    // The owner's leftover stays theirs: listed, opened, renamed away.
    lib.mkdir("lectures/week 1");
    assert!(drive_target(&lib.dir, "lectures").is_ok());
    lib.mkdir("Notes/agents");
    lib.mkdir("Plans");
    for name in crate::library::layout::OLD_STATE_NAMES {
        let upper = name.to_uppercase();
        assert_eq!(
            create_folder_at(&lib.dir, &upper).unwrap_err().kind,
            Kind::InvalidName,
            "{name}"
        );
        assert_eq!(
            rename_entry_at(&lib.dir, &lib.pool, "Plans", name)
                .await
                .unwrap_err()
                .kind,
            Kind::InvalidName,
            "{name}"
        );
    }
    assert_eq!(
        move_entries_at(&lib.dir, &lib.pool, &rels(&["Notes/agents"]), "")
            .await
            .unwrap_err()
            .kind,
        Kind::InvalidName
    );
    let copied = copy_to_own_at(&lib.dir, &lib.pool, &rels(&["Notes/agents"]), "")
        .await
        .unwrap();
    assert_eq!(copied, ["agents copy"]);
    // Below the top level the names are anyone's.
    assert!(create_folder_at(&lib.dir, "Notes/studio").is_ok());
    rename_entry_at(&lib.dir, &lib.pool, "lectures", "Old lectures")
        .await
        .unwrap();
}

#[tokio::test]
async fn files_import_and_copy_to_the_top_level_with_rows_on_the_reserved_row() {
    let lib = Lib::new("drive-top-import").await;
    let src = crate::test_support::Scratch::new("drive-top-import-src");
    crate::test_support::write_creating(src.join("courses/inner.pdf"), b"%PDF");
    crate::test_support::write_creating(src.join("timetable.png"), b"png");
    crate::test_support::write_creating(src.join("notes.md"), b"# n");
    let target = own_target(&lib.dir, TOP_LEVEL_CODE, None).unwrap();

    let outcomes = import_into(
        &lib.dir,
        &target,
        &[
            &src.join("courses"),
            &src.join("timetable.png"),
            &src.join("notes.md"),
        ],
    );
    let landed: Vec<(&str, &str)> = outcomes
        .iter()
        .map(|o| {
            let f = o.file.as_ref().unwrap();
            (f.relative_path.as_str(), f.category.as_str())
        })
        .collect();
    assert_eq!(
        landed,
        [
            ("courses (2)/inner.pdf", "upload"),
            ("timetable.png", "upload"),
            ("notes.md", "document"),
        ],
        "a picked folder never lands on the folder of subjects"
    );

    let synced = course_file("lecture.pdf");
    lib.file(&synced, b"%PDF").await;
    lib.mkdir("Videos");
    let copies = copy_to_own_at(
        &lib.dir,
        &lib.pool,
        &rels(&[&synced, "timetable.png"]),
        "Videos",
    )
    .await
    .unwrap();
    assert_eq!(copies, ["Videos/lecture.pdf", "Videos/timetable.png"]);
    assert_eq!(
        paths_of(&lib, TOP).await,
        ["Videos/lecture.pdf", "Videos/timetable.png"],
        "each copy has its own row, off the reserved row"
    );
    assert!(
        copy_to_own_at(&lib.dir, &lib.pool, &rels(&["courses"]), "Videos")
            .await
            .is_err(),
        "the folder of subjects is not copied"
    );
}

#[tokio::test]
async fn reconcile_gives_top_level_files_rows_and_leaves_the_rest() {
    let lib = Lib::new("drive-top-reconcile").await;
    lib.put("Videos/talk.mp4", b"mp4");
    lib.put("Videos/deep/er/board.whiteboard", b"{}");
    lib.put("timetable.png", b"png");
    lib.put("Receipts/.DS_Store", b"x");
    lib.put(".oculus/agents/outputs/draft.pdf", b"%PDF");
    lib.put(".library-move/done", b"done");
    lib.put(&own(CODE, "brief.pdf"), b"%PDF");
    lib.put("courses/cheatsheet.pdf", b"%PDF");

    let (subject, inserted, _) = reconcile_own_files_at(&lib.dir, &lib.pool, TOP_LEVEL_CODE)
        .await
        .unwrap();
    assert_eq!(subject, TOP);
    let mut got: Vec<(&str, &str)> = inserted
        .iter()
        .map(|f| (f.relative_path.as_str(), f.category.as_str()))
        .collect();
    got.sort();
    assert_eq!(
        got,
        [
            ("Videos/deep/er/board.whiteboard", "whiteboard"),
            ("Videos/talk.mp4", "upload"),
            ("timetable.png", "upload"),
        ]
    );
    assert!(
        paths_of(&lib, 1).await.is_empty(),
        "a subject's files wait for its own pass"
    );
    let again = reconcile_own_files_at(&lib.dir, &lib.pool, TOP_LEVEL_CODE)
        .await
        .unwrap();
    assert!(again.1.is_empty(), "a second pass adds nothing");

    let (_, inserted, _) = reconcile_own_files_at(&lib.dir, &lib.pool, CODE)
        .await
        .unwrap();
    assert_eq!(inserted.len(), 1);
    assert_eq!(
        paths_of(&lib, TOP).await.len(),
        3,
        "a subject's pass leaves the top level"
    );
}

#[tokio::test]
async fn deleting_a_top_level_file_takes_its_rows_and_records() {
    let lib = Lib::new("drive-top-delete").await;
    let id = lib.parsed_pdf("Videos/slides.pdf").await;
    let other = lib.parsed_pdf("Receipts/a.pdf").await;
    lib.put(".oculus/oculus.db", b"db");

    delete_entries_at(
        &lib.dir,
        &lib.pool,
        &rels(&["Videos/slides.pdf", "Receipts"]),
    )
    .await
    .unwrap();
    assert!(lib.row_of(id).await.is_none() && lib.row_of(other).await.is_none());
    assert!(lib.pages_of(id).await.is_empty());
    for kind in DerivedKind::ALL {
        assert!(
            !lib.exists(&derived_rel("Videos/slides.pdf", kind)),
            "{kind:?}"
        );
    }
    assert!(
        !lib.exists(".oculus/derived/Receipts"),
        "the folder's mirror went with it"
    );
    assert!(lib.exists("Videos") && lib.exists(".oculus/oculus.db"));
}
