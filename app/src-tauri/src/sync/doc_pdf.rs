//! An Office file's converted PDF (`paths::doc_pdf_rel`), made where it is
//! missing. An import and a sync convert at once; a file that arrives any
//! other way (Finder, a chat agent, the library move) has a row but no PDF.
//! `run_parse` converts it under its `parse::InFlight` claim, and the
//! viewer's `ensure_doc_pdf` joins that conversion or starts its own.

use std::path::Path;
use std::sync::OnceLock;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::library::paths;
use crate::parse::{InFlight, ParseError, CONVERSION_FAILED};

/// Office bytes and their extension to PDF bytes: `office_to_pdf`, or a
/// stand-in in tests.
pub(crate) type Convert<'a> = dyn Fn(&[u8], &str) -> Result<Vec<u8>, String> + 'a;

/// Told once a missing PDF lands, so a Drive card drawn as a glyph tries its
/// picture again.
pub const READY_EVENT: &str = "doc-pdf-ready";

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Bind once in app setup; the CLI leaves it unbound.
pub fn bind(app: AppHandle) {
    let _ = APP.set(app);
}

/// How often a viewer waiting on someone else's claim looks again: the PDF
/// lands mid-parse, long before that claim is let go.
const JOIN_POLL: Duration = Duration::from_millis(300);

/// True for an Office original on disk whose converted PDF is not.
pub fn needs_conversion(data_dir: &Path, rel: &str) -> bool {
    match paths::doc_pdf_rel(rel) {
        Some(pdf) if pdf != rel => data_dir.join(rel).is_file() && !data_dir.join(pdf).is_file(),
        _ => false,
    }
}

/// Convert `rel`'s missing PDF; the caller holds the `InFlight` claim on its
/// `parse_key`. `Ok(false)` when there was nothing to do (not an Office file,
/// or its PDF is there). A failed conversion is `CONVERSION_FAILED`, and
/// leaves no PDF behind.
pub(crate) fn convert_missing(
    data_dir: &Path,
    rel: &str,
    convert: &Convert<'_>,
) -> Result<bool, ParseError> {
    let Some(pdf_rel) = paths::doc_pdf_rel(rel).filter(|pdf| pdf != rel) else {
        return Ok(false);
    };
    let pdf = data_dir.join(&pdf_rel);
    if pdf.is_file() {
        return Ok(false);
    }
    let original = data_dir.join(rel);
    let bytes = std::fs::read(&original)
        .map_err(|_| ParseError::Io(format!("not on disk: {}", original.display())))?;
    let failed = || ParseError::Document {
        code: CONVERSION_FAILED.into(),
    };
    let ext = super::office_ext_of(rel).ok_or_else(failed)?;
    let made = convert(&bytes, ext).map_err(|e| {
        elog!("[oculus] convert {rel}: {e}");
        failed()
    })?;
    write_atomically(&pdf, &made)
        .map_err(|e| ParseError::Io(format!("could not save the converted PDF: {e}")))?;
    elog!("[oculus] convert {rel}: converted PDF written");
    if let Some(app) = APP.get() {
        app.emit(READY_EVENT, serde_json::json!({ "relative_path": rel }))
            .ok();
    }
    Ok(true)
}

/// A dot-named temp beside the PDF, renamed over it: a viewer never opens a
/// half-written PDF, and reconcile never rows the temp.
fn write_atomically(pdf: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = pdf.file_name().and_then(|n| n.to_str()).unwrap_or("pdf");
    let temp = pdf.with_file_name(format!(
        ".{name}.{}.tmp",
        crate::runtime::clock::now_nanos()
    ));
    std::fs::write(&temp, bytes)?;
    std::fs::rename(&temp, pdf).inspect_err(|_| {
        let _ = std::fs::remove_file(&temp);
    })
}

/// Make `rel`'s converted PDF if it is missing, for the viewer: returns once
/// it is on disk. A parse holding the file is converting it or already has,
/// so this waits for the PDF or the claim, whichever comes first.
/// `converting` is called once, when there is a conversion to wait for.
pub(crate) fn ensure(
    data_dir: &Path,
    rel: &str,
    convert: &Convert<'_>,
    converting: &dyn Fn(),
) -> Result<(), ParseError> {
    if crate::library::drive::ops::delete::held(&data_dir.join(rel)) {
        return Err(ParseError::Io(format!("{rel} is in the Trash")));
    }
    let key = super::parse_key(data_dir, rel);
    let mut told = false;
    loop {
        if key.is_file() {
            return Ok(());
        }
        if !data_dir.join(rel).is_file() {
            return Err(ParseError::Io(format!("not on disk: {rel}")));
        }
        if !std::mem::replace(&mut told, true) {
            converting();
        }
        if let Ok(_claim) = InFlight::shared().try_claim_all(std::slice::from_ref(&key)) {
            convert_missing(data_dir, rel, convert)?;
            return if key.is_file() {
                Ok(())
            } else {
                Err(ParseError::Io(format!("not on disk: {}", key.display())))
            };
        }
        std::thread::sleep(JOIN_POLL);
    }
}

/// Make an Office file's converted PDF if it is missing, resolving once it is
/// there; `converting` hears `"converting"` when there is a conversion to
/// wait for. Refuses with a code the viewer words: `not-found` (the original
/// is gone), `no-libreoffice`, `office-conversion`, else the sentence.
#[tauri::command]
pub async fn ensure_doc_pdf(
    relative_path: String,
    converting: tauri::ipc::Channel<&'static str>,
) -> Result<(), String> {
    let data_dir = paths::data_dir();
    crate::runtime::blocking::run(move || {
        let told = || {
            converting.send("converting").ok();
        };
        ensure(&data_dir, &relative_path, &super::office_to_pdf, &told)
            .map_err(|e| refusal(&e, super::office::libreoffice_installed()))
    })
    .await
}

pub(super) fn refusal(error: &ParseError, libreoffice: bool) -> String {
    match error {
        ParseError::Document { code } if code == CONVERSION_FAILED && !libreoffice => {
            "no-libreoffice".into()
        }
        ParseError::Document { code } => code.clone(),
        ParseError::Io(detail) if detail.starts_with("not on disk") => "not-found".into(),
        other => other.to_string(),
    }
}
