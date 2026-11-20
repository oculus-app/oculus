//! The mechanical checks a director would otherwise make by eye on a
//! strip. Three are errors, the look of a slide: type too small for the
//! chat player (`small_text`), content in a small part of the frame
//! (`sparse`) and a title held at the top (`scene_title`). Three are
//! warnings: something past the frame's edge (`off_frame`), dead air
//! (`still`) and a leftover fragment at the end (`fragment`). Each names
//! the time span and the words said in it. Thresholds are in `limits`.

mod fragment;
mod off_frame;
mod scene_title;
mod small_text;
mod sparse;
mod still;

use super::entities::{Entity, entities};
use super::sample::SceneLook;

/// One finding about how a scene looks.
#[derive(Clone, Debug)]
pub struct Warning {
    /// `small_text`, `sparse`, `scene_title`, `off_frame`, `still` or
    /// `fragment`.
    pub kind: &'static str,
    /// It fails lint (the first three kinds); the rest are warnings.
    pub error: bool,
    /// What one is called in a grouped line: `off-frame node`.
    pub noun: &'static str,
    /// It in a few words, for a grouped line.
    pub short: String,
    pub message: String,
}

impl SceneLook {
    /// Every finding, errors first, in the order of the checks.
    pub fn warnings(&self) -> Vec<Warning> {
        let shown: Vec<Vec<Entity>> = self
            .samples
            .iter()
            .map(|s| entities(s, self.size, &self.component))
            .collect();
        let mut out = Vec::new();
        small_text::check(self, &shown, &mut out);
        sparse::check(self, &shown, &mut out);
        scene_title::check(self, &mut out);
        off_frame::check(self, &shown, &mut out);
        still::check(self, &shown, &mut out);
        fragment::check(self, &shown, &mut out);
        out
    }
}

/// `12.3 s`
pub(crate) fn secs(t: f64) -> String {
    format!("{t:.1} s")
}

/// `12.3-16.0 s`
pub(crate) fn span(a: f64, b: f64) -> String {
    format!("{a:.1}-{b:.1} s")
}
