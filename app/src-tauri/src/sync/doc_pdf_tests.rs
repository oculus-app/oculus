use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::doc_pdf::{convert_missing, ensure, needs_conversion, refusal};
use super::parse::run_parse;
use crate::parse::{self, InFlight, ParseError, CONVERSION_FAILED};
use crate::test_support::Scratch;

const PDF: &[u8] = b"%PDF-1.4 converted";

fn library(name: &str) -> Scratch {
    let lib = Scratch::new(&format!("doc-pdf-{name}"));
    fs::write(lib.join("notes.docx"), b"docx bytes").unwrap();
    lib
}

fn is_conversion_failure(error: &ParseError) -> bool {
    matches!(error, ParseError::Document { code } if code == CONVERSION_FAILED)
}

/// Nothing but the PDF itself lands beside the original.
fn names(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

#[test]
fn only_an_office_original_without_its_pdf_needs_converting() {
    let lib = library("needs");
    assert!(needs_conversion(&lib, "notes.docx"));
    fs::write(lib.join("notes.docx.pdf"), PDF).unwrap();
    assert!(!needs_conversion(&lib, "notes.docx"));
    // A PDF is its own; a missing original has nothing to convert.
    fs::write(lib.join("plain.pdf"), PDF).unwrap();
    assert!(!needs_conversion(&lib, "plain.pdf"));
    assert!(!needs_conversion(&lib, "gone.pptx"));
    assert!(!needs_conversion(&lib, "marks.xlsx"));
}

#[test]
fn a_missing_pdf_is_converted_from_the_original_and_lands_whole() {
    let lib = library("convert");
    let calls = AtomicUsize::new(0);
    let convert = |bytes: &[u8], ext: &str| {
        calls.fetch_add(1, Ordering::SeqCst);
        assert_eq!((bytes, ext), (&b"docx bytes"[..], "docx"));
        Ok(PDF.to_vec())
    };
    assert!(convert_missing(&lib, "notes.docx", &convert).unwrap());
    assert_eq!(fs::read(lib.join("notes.docx.pdf")).unwrap(), PDF);
    assert_eq!(names(&lib), ["notes.docx", "notes.docx.pdf"]);
    // There now, so nothing runs again.
    assert!(!convert_missing(&lib, "notes.docx", &convert).unwrap());
    assert_eq!(calls.load(Ordering::SeqCst), 1);
}

#[test]
fn a_failed_conversion_is_the_conversion_failure_and_leaves_no_pdf() {
    let lib = library("fails");
    let convert = |_: &[u8], _: &str| Err("soffice exited with 1".to_string());
    let error = convert_missing(&lib, "notes.docx", &convert).unwrap_err();
    assert!(is_conversion_failure(&error), "{error:?}");
    assert_eq!(names(&lib), ["notes.docx"]);
}

#[test]
fn the_viewer_takes_a_pdf_already_there_without_converting() {
    let lib = library("present");
    fs::write(lib.join("notes.docx.pdf"), PDF).unwrap();
    let convert = |_: &[u8], _: &str| -> Result<Vec<u8>, String> { panic!("converted again") };
    ensure(&lib, "notes.docx", &convert, &|| {
        panic!("said it was converting")
    })
    .unwrap();
}

/// A parse holding the file converts it; the viewer waits for the PDF, not
/// for the parse to let go.
#[test]
fn the_viewer_joins_a_conversion_a_parse_is_running() {
    let lib = library("join");
    let key = super::parse_key(&lib, "notes.docx");
    let claim = InFlight::shared().claim(&key);
    let viewer = {
        let dir = lib.to_path_buf();
        std::thread::spawn(move || {
            let convert =
                |_: &[u8], _: &str| -> Result<Vec<u8>, String> { panic!("converted twice") };
            ensure(&dir, "notes.docx", &convert, &|| {})
        })
    };
    std::thread::sleep(std::time::Duration::from_millis(100));
    fs::write(&key, PDF).unwrap();
    viewer.join().unwrap().unwrap();
    drop(claim);
}

#[test]
fn the_viewer_converts_when_nothing_else_is() {
    let lib = library("viewer");
    let told = AtomicUsize::new(0);
    let converting = || {
        told.fetch_add(1, Ordering::SeqCst);
    };
    ensure(
        &lib,
        "notes.docx",
        &|_: &[u8], _: &str| Ok(PDF.to_vec()),
        &converting,
    )
    .unwrap();
    assert_eq!(fs::read(lib.join("notes.docx.pdf")).unwrap(), PDF);
    assert_eq!(told.load(Ordering::SeqCst), 1);
    let missing = ensure(
        &lib,
        "gone.docx",
        &|_: &[u8], _: &str| Ok(PDF.to_vec()),
        &converting,
    );
    assert_eq!(refusal(&missing.unwrap_err(), true), "not-found");
}

#[test]
fn a_parse_converts_a_missing_pdf_before_anything_else() {
    let lib = library("parse");
    let pdf = lib.join("notes.docx.pdf");
    // A record that outlived its PDF stands: the parse is not repeated.
    let pages = parse::pages_path(&pdf);
    fs::create_dir_all(pages.parent().unwrap()).unwrap();
    fs::write(
        &pages,
        r#"{"pdf":"notes.docx.pdf","mode":"quality","parser_version":3,"page_count":1,"pages":[{"page_no":1,"markdown":"hi"}]}"#,
    )
    .unwrap();
    let convert = |_: &[u8], _: &str| Ok(PDF.to_vec());
    let summary = run_parse(&lib, "notes.docx", -1, false, &|_| {}, &convert).unwrap();
    assert!(summary.skipped);
    assert_eq!(fs::read(&pdf).unwrap(), PDF);
}

#[test]
fn a_parse_whose_conversion_fails_ends_as_the_conversion_failure() {
    let lib = library("parse-fails");
    let convert = |_: &[u8], _: &str| Err("LibreOffice not installed".to_string());
    let error = run_parse(&lib, "notes.docx", -1, false, &|_| {}, &convert).unwrap_err();
    assert!(is_conversion_failure(&error), "{error:?}");
    assert!(!lib.join("notes.docx.pdf").exists());
}

#[test]
fn a_skipped_file_is_not_converted_by_its_parse() {
    let lib = library("skipped");
    let key = super::parse_key(&lib, "notes.docx");
    parse::Skips::shared().mark(&key);
    let convert = |_: &[u8], _: &str| -> Result<Vec<u8>, String> { panic!("converted a skip") };
    let error = run_parse(&lib, "notes.docx", -1, false, &|_| {}, &convert).unwrap_err();
    parse::Skips::shared().clear(&key);
    assert!(matches!(error, ParseError::Cancelled), "{error:?}");
    assert!(!key.exists());
}

#[test]
fn the_viewer_is_told_which_conversion_failure_it_was() {
    let failed = ParseError::Document {
        code: CONVERSION_FAILED.into(),
    };
    assert_eq!(refusal(&failed, true), CONVERSION_FAILED);
    assert_eq!(refusal(&failed, false), "no-libreoffice");
}
