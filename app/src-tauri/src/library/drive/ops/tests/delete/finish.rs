use super::*;
use crate::library::drive::ops::delete::finish_at;
use crate::library::layout::{derived_rel, DerivedKind};

#[tokio::test]
async fn a_final_delete_takes_rows_links_and_records_and_leaves_the_trash_alone() {
    let lib = Lib::new("delete-finish").await;
    let pdf = own(CODE, "Exam/2024.pdf");
    let id = lib.parsed_pdf(&pdf).await;
    let single = own(CODE, "slides.docx");
    let single_id = lib.file(&single, b"docx").await;
    lib.put(&own(CODE, "slides.docx.pdf"), b"%PDF converted");
    link_everything(&lib, single_id).await;
    let top = lib.parsed_pdf("Receipts/a.pdf").await;
    let sent = send(
        &lib,
        FakeBin::new(&lib),
        &[&own(CODE, "Exam"), &single, "Receipts"],
    )
    .await;

    finish_at(&lib.pool, sent.handle.unwrap()).await.unwrap();
    for gone in [id, single_id, top] {
        assert!(lib.row_of(gone).await.is_none());
        assert!(lib.pages_of(gone).await.is_empty());
    }
    assert_eq!(links_of(&lib, single_id).await, 0);
    assert!(
        !lib.exists(&own(CODE, "slides.docx.pdf")),
        "the converted copy goes"
    );
    assert!(!lib.exists(&own(CODE, ".oculus/derived/Exam")));
    assert!(!lib.exists(".oculus/derived/Receipts"));
    for kind in DerivedKind::ALL {
        assert!(!lib.exists(&derived_rel(&pdf, kind)), "{kind:?}");
    }
    assert_eq!(
        FakeBin::names(&lib),
        ["1-Exam", "2-slides.docx", "3-Receipts"]
    );
    // Twice is nothing.
    finish_at(&lib.pool, sent.handle.unwrap()).await.unwrap();
}
