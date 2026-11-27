use super::*;
use crate::library::drive::listing::list_folder_at;
use crate::library::drive::ops::delete::{finish_at, held};
use crate::library::drive::ops::error::Kind;
use crate::library::drive::ops::names::free_name;
use crate::library::layout::{derived_rel, DerivedKind};

#[tokio::test]
async fn a_delete_puts_the_entry_in_the_trash_and_changes_nothing_else_yet() {
    let lib = Lib::new("delete-send").await;
    let pdf = own(CODE, "Exam/2024.pdf");
    let id = lib.parsed_pdf(&pdf).await;
    let single = own(CODE, "slides.pdf");
    let single_id = lib.parsed_pdf(&single).await;
    let note = lib.file(&own(CODE, "notes.md"), b"x").await;
    link_everything(&lib, note).await;
    let bin = FakeBin::new(&lib);

    let sent = send(
        &lib,
        bin,
        &[&own(CODE, "Exam"), &single, &own(CODE, "notes.md")],
    )
    .await;
    assert!(sent.handle.is_some());
    assert_eq!(
        FakeBin::names(&lib),
        ["1-Exam", "2-slides.pdf", "3-notes.md"]
    );
    assert!(!lib.exists(&own(CODE, "Exam")) && !lib.exists(&single));
    for (row, rel) in [(id, &pdf), (single_id, &single)] {
        assert_eq!(
            &lib.row_of(row).await.unwrap().1,
            rel,
            "rows stay as they were"
        );
        assert_eq!(lib.pages_of(row).await.len(), 1);
    }
    assert_eq!(links_of(&lib, note).await, 4);
    // A folder's text and pictures went with it; its records wait, and a
    // file's artifacts all wait beside it.
    for kind in [DerivedKind::Pages, DerivedKind::Embeddings] {
        assert!(lib.exists(&derived_rel(&pdf, kind)), "{kind:?}");
    }
    for kind in DerivedKind::ALL {
        assert!(lib.exists(&derived_rel(&single, kind)), "{kind:?}");
    }

    // Nowhere Drive lists, and its names are held.
    let listing = list_folder_at(&lib.dir, &root(CODE), false, &[]).unwrap();
    let names: Vec<&str> = listing.files.iter().map(|f| f.name.as_str()).collect();
    assert!(!names.iter().any(|n| n.starts_with("slides")), "{names:?}");
    assert!(held(&lib.path(&single)) && held(&lib.path(&own(CODE, "Exam/2024.pdf"))));
    assert_eq!(
        free_name(&lib.path(&root(CODE)), "slides.pdf", false, |_| false),
        "slides (2).pdf"
    );

    finish_at(&lib.pool, sent.handle.unwrap()).await.unwrap();
    assert!(!held(&lib.path(&single)));
}

#[tokio::test]
async fn one_the_trash_refuses_brings_the_others_back_and_removes_nothing() {
    let lib = Lib::new("delete-refused").await;
    let a = own(CODE, "a.md");
    let b = own(CODE, "b.md");
    let a_id = lib.file(&a, b"a").await;
    lib.file(&b, b"b").await;
    let bin = Arc::new(FakeBin::with(&lib, Some("b.md"), false));
    let error = send_at(&lib.dir, &lib.pool, &rels(&[&a, &b]), bin)
        .await
        .unwrap_err();
    assert!(error.message.contains("no Trash"), "{}", error.message);
    assert_eq!(lib.read(&a), "a");
    assert_eq!(lib.read(&b), "b");
    assert!(lib.row_of(a_id).await.is_some());
    assert!(FakeBin::names(&lib).is_empty());
    assert!(!held(&lib.path(&a)));
}

#[tokio::test]
async fn with_no_word_of_where_it_went_the_delete_is_final_at_once() {
    let lib = Lib::new("delete-silent").await;
    let pdf = own(CODE, "slides.pdf");
    let id = lib.parsed_pdf(&pdf).await;
    let bin = Arc::new(FakeBin::with(&lib, None, true));
    let sent = send_at(&lib.dir, &lib.pool, &rels(&[&pdf]), bin)
        .await
        .unwrap();
    assert_eq!(sent.handle, None);
    assert!(lib.row_of(id).await.is_none());
    assert!(!lib.exists(&derived_rel(&pdf, DerivedKind::Markdown)));
    assert_eq!(FakeBin::names(&lib), ["1-slides.pdf"]);
}

#[tokio::test]
async fn course_files_and_subject_folders_are_never_deleted() {
    let lib = Lib::new("delete-readonly").await;
    let synced = course_file("a.pdf");
    let id = lib.file(&synced, b"%PDF").await;
    for rel in [synced.as_str(), &root(CODE), "courses", ".oculus"] {
        let error = send_at(&lib.dir, &lib.pool, &rels(&[rel]), FakeBin::new(&lib))
            .await
            .unwrap_err();
        assert!(
            matches!(error.kind, Kind::ReadOnly | Kind::InvalidName),
            "{rel}: {error:?}"
        );
    }
    assert!(lib.exists(&synced) && lib.row_of(id).await.is_some());
    assert!(FakeBin::names(&lib).is_empty());
}

#[tokio::test]
async fn a_second_delete_makes_the_first_final() {
    let lib = Lib::new("delete-second").await;
    let first = lib.file(&own(CODE, "first.md"), b"1").await;
    let second = lib.file(&own(CODE, "second.md"), b"2").await;
    let bin = FakeBin::new(&lib);
    send(&lib, bin.clone(), &[&own(CODE, "first.md")]).await;
    let sent = send(&lib, bin, &[&own(CODE, "second.md")]).await;
    assert!(lib.row_of(first).await.is_none(), "the first is final");
    assert!(
        lib.row_of(second).await.is_some(),
        "the second still pending"
    );
    finish_at(&lib.pool, sent.handle.unwrap()).await.unwrap();
}
