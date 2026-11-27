use std::path::Path;

use crate::library::layout::{derived, derived_rel, is_derived_text, DerivedKind};
use crate::test_support::Scratch;

#[test]
fn text_and_pictures_sit_beside_the_records_in_oculus() {
    let cases = [
        (DerivedKind::Markdown, "courses/X/Course/Files/week 1.md"),
        (
            DerivedKind::Pages,
            "courses/X/.oculus/derived/Course/Files/week 1.pages.json",
        ),
        (
            DerivedKind::Embeddings,
            "courses/X/.oculus/derived/Course/Files/week 1.emb.json",
        ),
        (DerivedKind::Images, "courses/X/Course/Files/week 1_images"),
    ];
    for (kind, want) in cases {
        assert_eq!(derived_rel("courses/X/Course/Files/week 1.pdf", kind), want);
    }
}

#[test]
fn an_own_pdf_mirrors_its_folder_under_derived() {
    assert_eq!(
        derived_rel("courses/X/scan.pdf", DerivedKind::Pages),
        "courses/X/.oculus/derived/scan.pages.json"
    );
    assert_eq!(
        derived_rel("courses/X/Exam prep/Ü.pdf", DerivedKind::Embeddings),
        "courses/X/.oculus/derived/Exam prep/Ü.emb.json"
    );
}

#[test]
fn an_office_file_derives_from_its_converted_pdf() {
    assert_eq!(
        derived_rel(
            "courses/X/Course/Files/deck.pptx.pdf",
            DerivedKind::Markdown
        ),
        "courses/X/Course/Files/deck.pptx.md"
    );
    assert_eq!(
        derived_rel("courses/X/Course/Files/marks.xlsx.pdf", DerivedKind::Images),
        "courses/X/Course/Files/marks.xlsx_images"
    );
}

#[test]
fn an_absolute_path_finds_its_subject() {
    assert_eq!(
        derived(
            Path::new("/lib/courses/X/Course/Files/SCAN.PDF"),
            DerivedKind::Pages
        ),
        Path::new("/lib/courses/X/.oculus/derived/Course/Files/SCAN.pages.json")
    );
    // Outside any subject, everything stays beside the PDF.
    assert_eq!(
        derived(Path::new("/lib/a/SCAN.PDF"), DerivedKind::Pages),
        Path::new("/lib/a/SCAN.pages.json")
    );
    assert_eq!(
        derived_rel("courses/X", DerivedKind::Pages),
        "courses/X.pages.json"
    );
}

#[test]
fn parsed_and_sheet_text_is_not_a_note() {
    let dir = Scratch::new("layout-derived-text");
    let write = |rel: &str| {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, "x").unwrap();
    };
    write("courses/X/scan.pdf");
    write("courses/X/scan.md");
    write("courses/X/.oculus/derived/scan.pages.json");
    write("courses/X/marks.xlsx");
    write("courses/X/marks.xlsx.md");
    write("courses/X/draft.pdf");
    write("courses/X/draft.md");
    write("courses/X/notes.md");
    assert!(is_derived_text(&dir, "courses/X/scan.md"));
    assert!(is_derived_text(&dir, "courses/X/marks.xlsx.md"));
    // A PDF never parsed leaves the note of the same name a note.
    assert!(!is_derived_text(&dir, "courses/X/draft.md"));
    assert!(!is_derived_text(&dir, "courses/X/notes.md"));
}

#[test]
fn a_top_level_files_records_sit_under_the_top_levels_hidden_folder() {
    use crate::library::layout::derived_at;
    assert_eq!(
        derived_rel("Videos/Raw/talk.pdf", DerivedKind::Pages),
        ".oculus/derived/Videos/Raw/talk.pages.json"
    );
    assert_eq!(
        derived_rel("scan.pdf", DerivedKind::Embeddings),
        ".oculus/derived/scan.emb.json"
    );
    // The text and its pictures stay beside the file.
    assert_eq!(
        derived_rel("Videos/talk.pdf", DerivedKind::Markdown),
        "Videos/talk.md"
    );
    assert_eq!(
        derived_rel("Videos/talk.pdf", DerivedKind::Images),
        "Videos/talk_images"
    );
    // A folder of the student's that holds its own `courses` is not a subject.
    assert_eq!(
        derived_rel("Old/courses/X/a.pdf", DerivedKind::Pages),
        ".oculus/derived/Old/courses/X/a.pages.json"
    );
    // App state and a loose file among the subjects keep theirs beside them.
    assert_eq!(
        derived_rel(".oculus/agents/outputs/a.pdf", DerivedKind::Pages),
        ".oculus/agents/outputs/a.pages.json"
    );
    assert_eq!(
        derived_rel("courses/loose.pdf", DerivedKind::Pages),
        "courses/loose.pages.json"
    );
    assert_eq!(
        derived_at(Path::new("/lib"), "Videos/talk.pdf", DerivedKind::Pages),
        Path::new("/lib/.oculus/derived/Videos/talk.pages.json")
    );
}

/// The parser is handed an absolute path: under the app's data dir it lands
/// where the relative spelling does. Path arithmetic only; nothing is read.
#[test]
fn an_absolute_top_level_path_is_read_against_the_data_dir() {
    let data_dir = crate::library::paths::data_dir();
    assert_eq!(
        derived(&data_dir.join("Videos/talk.pdf"), DerivedKind::Pages),
        data_dir.join(".oculus/derived/Videos/talk.pages.json")
    );
    assert_eq!(
        derived(&data_dir.join("courses/X/a.pdf"), DerivedKind::Pages),
        data_dir.join("courses/X/.oculus/derived/a.pages.json")
    );
    assert_eq!(
        derived(&data_dir.join(".oculus/agents/a.pdf"), DerivedKind::Pages),
        data_dir.join(".oculus/agents/a.pages.json")
    );
}
