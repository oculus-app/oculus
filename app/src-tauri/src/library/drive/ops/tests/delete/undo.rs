use super::*;
use crate::library::drive::ops::delete::{held, undo_at};
use crate::library::drive::ops::error::Kind;
use crate::library::layout::{derived_rel, DerivedKind};

async fn modified(lib: &Lib, id: i64) -> Option<String> {
    sqlx::query_scalar("SELECT modified_at FROM files WHERE id = ?1")
        .bind(id)
        .fetch_one(&lib.pool)
        .await
        .unwrap()
}

#[tokio::test]
async fn undo_puts_everything_back_exactly() {
    let lib = Lib::new("delete-undo").await;
    let pdf = own(CODE, "Exam/2024.pdf");
    let id = lib.parsed_pdf(&pdf).await;
    let note = own(CODE, "Exam/notes.md");
    let note_id = lib.file(&note, b"See ![](.assets/p.png)").await;
    lib.put(&own(CODE, "Exam/.assets/p.png"), b"png");
    link_everything(&lib, note_id).await;
    let top = lib.parsed_pdf("slides.pdf").await;
    sqlx::query("UPDATE files SET modified_at = '2026-01-01 00:00:00'")
        .execute(&lib.pool)
        .await
        .unwrap();
    let before = (lib.row_of(id).await, lib.pages_of(id).await);
    let sent = send(
        &lib,
        FakeBin::new(&lib),
        &[&own(CODE, "Exam"), "slides.pdf"],
    )
    .await;

    let back = undo_at(&lib.pool, sent.handle.unwrap()).await.unwrap();
    assert_eq!(back, [own(CODE, "Exam"), "slides.pdf".to_string()]);
    assert_eq!((lib.row_of(id).await, lib.pages_of(id).await), before);
    assert_eq!(lib.row_of(top).await.unwrap().0, TOP);
    assert_eq!(links_of(&lib, note_id).await, 4);
    assert_eq!(
        modified(&lib, id).await.as_deref(),
        Some("2026-01-01 00:00:00")
    );
    assert_eq!(lib.read(&note), "See ![](.assets/p.png)");
    assert!(lib.exists(&own(CODE, "Exam/.assets/p.png")));
    for kind in DerivedKind::ALL {
        assert!(lib.exists(&derived_rel(&pdf, kind)), "{kind:?}");
        assert!(lib.exists(&derived_rel("slides.pdf", kind)), "{kind:?}");
    }
    assert!(FakeBin::names(&lib).is_empty());
    assert!(!held(&lib.path("slides.pdf")));
    let again = undo_at(&lib.pool, sent.handle.unwrap()).await.unwrap_err();
    assert_eq!(again.kind, Kind::NotFound);
}

#[tokio::test]
async fn a_gone_folder_is_made_again_and_a_taken_place_steps_aside() {
    let lib = Lib::new("delete-undo-odd").await;
    let pdf = own(CODE, "Exam/Past/slides.pdf");
    let id = lib.parsed_pdf(&pdf).await;
    let sent = send(&lib, FakeBin::new(&lib), &[&pdf]).await;
    // The folder went meanwhile (its records with it), made again on Undo.
    std::fs::remove_dir_all(lib.path(&own(CODE, "Exam"))).unwrap();
    std::fs::remove_dir_all(lib.path(&own(CODE, ".oculus/derived/Exam"))).unwrap();
    assert_eq!(
        undo_at(&lib.pool, sent.handle.unwrap()).await.unwrap(),
        std::slice::from_ref(&pdf)
    );
    assert_eq!(lib.read(&pdf), "%PDF-1.4");
    assert_eq!(lib.row_of(id).await.unwrap().1, pdf);

    // Something else saved at its place meanwhile: the next free name, the
    // records and pages following as a rename's do.
    let id = lib.parsed_pdf(&own(CODE, "talk.pdf")).await;
    let sent = send(&lib, FakeBin::new(&lib), &[&own(CODE, "talk.pdf")]).await;
    lib.put(&own(CODE, "talk.pdf"), b"%PDF another");
    let back = own(CODE, "talk (2).pdf");
    assert_eq!(
        undo_at(&lib.pool, sent.handle.unwrap()).await.unwrap(),
        std::slice::from_ref(&back)
    );
    assert_eq!(lib.read(&own(CODE, "talk.pdf")), "%PDF another");
    assert_eq!(lib.read(&back), "%PDF-1.4");
    assert_eq!(lib.row_of(id).await.unwrap().1, back);
    let prefix = images_prefix(&back);
    assert!(lib.pages_of(id).await[0].contains(&format!("]({prefix}/x.png)")));
    assert!(lib
        .read(&derived_rel(&back, DerivedKind::Markdown))
        .contains(&format!("]({prefix}/x.png)")));
    assert!(lib.exists(&derived_rel(&back, DerivedKind::Pages)));
}

#[tokio::test]
async fn one_emptied_from_the_trash_meanwhile_is_final_instead() {
    let lib = Lib::new("delete-undo-emptied").await;
    let id = lib.file(&own(CODE, "gone.md"), b"x").await;
    let sent = send(&lib, FakeBin::new(&lib), &[&own(CODE, "gone.md")]).await;
    std::fs::remove_file(lib.path(".fake-trash/1-gone.md")).unwrap();
    let error = undo_at(&lib.pool, sent.handle.unwrap()).await.unwrap_err();
    assert_eq!(error.kind, Kind::NotFound);
    assert!(lib.row_of(id).await.is_none());
}
