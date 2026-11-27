//! Library paths the viewer may read, and opening them through
//! `pdf_render`'s cache of opened documents.

use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use hayro::hayro_syntax::page::Page;
use hayro::hayro_syntax::Pdf;

use super::wire::{OpenedPdf, PageSize};
use crate::library::pdf_render::{self, OpenError};

/// What the viewer may read: the library (`layout::in_library`) and the
/// agents' workspace.
fn readable(relative: &str) -> bool {
    crate::library::layout::in_library(relative)
        || relative.split('/').next() == Some(crate::agents::AGENTS_DIR)
}

/// `relative` under `root`, if it names something the viewer may read.
pub(super) fn resolve_in(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if !readable(relative)
        || !path
            .components()
            .all(|part| matches!(part, Component::Normal(_)))
    {
        return Err("outside-library".into());
    }
    Ok(root.join(path))
}

/// The document at `relative`, from `pdf_render`'s cache when its file is
/// unchanged.
pub(super) fn open_at(root: &Path, relative: &str) -> Result<Arc<Pdf>, String> {
    let path = resolve_in(root, relative)?;
    pdf_render::open_cached(&path).map_err(|error| {
        match error {
            OpenError::Read(_) => "not-found",
            OpenError::Encrypted => "encrypted",
            OpenError::Invalid => "invalid",
            OpenError::Panicked => "render-failed",
        }
        .to_string()
    })
}

/// Runs a hayro call, turning a panic inside it into "render-failed".
pub(super) fn guarded<T>(work: impl FnOnce() -> T) -> Result<T, String> {
    pdf_render::guarded(work).map_err(|_| "render-failed".to_string())
}

pub(super) fn page_sizes(pdf: &Pdf) -> OpenedPdf {
    let pages = pdf
        .pages()
        .iter()
        .map(|page| {
            let (width, height) = page.render_dimensions();
            PageSize { width, height }
        })
        .collect();
    OpenedPdf { pages }
}

pub(super) fn page_of(pdf: &Pdf, page: u32) -> Result<&Page<'_>, String> {
    (page as usize)
        .checked_sub(1)
        .and_then(|index| pdf.pages().get(index))
        .ok_or_else(|| "page-out-of-range".to_string())
}
