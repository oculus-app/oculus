//! What the folder picker reaches: a selection from more than one home
//! landing in another, and a synced file copied into another subject.

use super::*;
use crate::library::drive::ops::copy::copy_to_own_at;
use crate::library::drive::ops::error::Kind;
use crate::library::drive::ops::moves::move_entries_at;

async fn subject_of(lib: &Lib, rel: &str) -> Option<i64> {
    sqlx::query_scalar("SELECT subject_id FROM files WHERE relative_path = ?1")
        .bind(rel)
        .fetch_optional(&lib.pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn a_selection_from_two_homes_lands_in_a_third_with_every_id_kept() {
    let lib = Lib::new("drive-across-mixed").await;
    let in_subject = own(CODE, "Labs/lab.pdf");
    let pdf = lib.parsed_pdf(&in_subject).await;
    let photo = lib.file("Scans/photo.png", b"png").await;
    let note = lib.file("Scans/Week 1/notes.md", b"# n").await;
    lib.mkdir(&own(OTHER, "Inbox"));

    let target = own(OTHER, "Inbox");
    let moved = move_entries_at(
        &lib.dir,
        &lib.pool,
        &rels(&[&in_subject, "Scans/photo.png", "Scans/Week 1"]),
        &target,
    )
    .await
    .unwrap();

    let landed: Vec<&str> = moved.iter().map(|(_, to)| to.as_str()).collect();
    assert_eq!(
        landed,
        [
            format!("{target}/lab.pdf"),
            format!("{target}/photo.png"),
            format!("{target}/Week 1"),
        ]
    );
    for (id, rel) in [
        (pdf, format!("{target}/lab.pdf")),
        (photo, format!("{target}/photo.png")),
        (note, format!("{target}/Week 1/notes.md")),
    ] {
        let (subject, path, ..) = lib.row_of(id).await.unwrap();
        assert_eq!((subject, path), (2, rel), "row {id} follows by id");
    }
    assert_eq!(lib.pages_of(pdf).await.len(), 1, "the parse goes with it");
    assert!(!lib.exists(&in_subject) && !lib.exists("Scans/photo.png"));
}

#[tokio::test]
async fn the_same_selection_lands_at_the_top_level_on_the_reserved_row() {
    let lib = Lib::new("drive-across-top").await;
    let a = lib.file(&own(CODE, "a.md"), b"# a").await;
    let b = lib.file(&own(OTHER, "Week 2/b.md"), b"# b").await;

    move_entries_at(
        &lib.dir,
        &lib.pool,
        &rels(&[&own(CODE, "a.md"), &own(OTHER, "Week 2")]),
        "",
    )
    .await
    .unwrap();

    let (subject, path, ..) = lib.row_of(a).await.unwrap();
    assert_eq!((subject, path.as_str()), (TOP, "a.md"));
    let (subject, path, ..) = lib.row_of(b).await.unwrap();
    assert_eq!((subject, path.as_str()), (TOP, "Week 2/b.md"));
}

#[tokio::test]
async fn a_synced_file_copies_into_another_subject_with_a_row_there() {
    let lib = Lib::new("drive-across-copy").await;
    let synced = course_file("lecture.pdf");
    let source = lib.file(&synced, b"%PDF").await;
    lib.mkdir(&own(OTHER, "Borrowed"));

    let copies = copy_to_own_at(
        &lib.dir,
        &lib.pool,
        &rels(&[&synced]),
        &own(OTHER, "Borrowed"),
    )
    .await
    .unwrap();

    let copy = own(OTHER, "Borrowed/lecture.pdf");
    assert_eq!(copies, std::slice::from_ref(&copy));
    assert_eq!(subject_of(&lib, &copy).await, Some(2));
    assert_eq!(
        lib.row_of(source).await.unwrap().1,
        synced,
        "the source stays"
    );
}

#[tokio::test]
async fn nothing_lands_in_the_folder_of_subjects() {
    let lib = Lib::new("drive-across-subjects-folder").await;
    let rel = own(CODE, "a.md");
    let id = lib.file(&rel, b"# a").await;

    let moved = move_entries_at(&lib.dir, &lib.pool, &rels(&[&rel]), "courses").await;
    assert_eq!(moved.unwrap_err().kind, Kind::ReadOnly);
    let copied = copy_to_own_at(&lib.dir, &lib.pool, &rels(&[&rel]), "courses").await;
    assert_eq!(copied.unwrap_err().kind, Kind::ReadOnly);
    assert_eq!(lib.row_of(id).await.unwrap().1, rel);
    assert!(lib.exists(&rel));
}
