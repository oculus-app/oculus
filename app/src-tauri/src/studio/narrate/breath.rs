//! A `[breath]`: the silence after a word topped up to its length. Where
//! the voice already paused, the zeros go in the middle of that pause;
//! where it ran on, at the quietest moment between the two words. Kokoro
//! pauses at about one comma in six, so a script marks where a breath
//! falls and how long it is. A breath never shortens a silence.

use super::clip::{cut, Insert};
use crate::studio::timing::WordTime;

/// Loudness is measured over frames this long.
const FRAME_SECONDS: f64 = 0.01;
/// A frame under this share of the clip's 95th-percentile RMS is quiet.
const QUIET: f32 = 0.03;
/// The quiet floor for a clip that is nearly all silence.
const QUIET_FLOOR: f32 = 1e-4;
/// A quiet stretch shorter than this is a stop consonant, not a pause.
const MIN_RUN_SECONDS: f64 = 0.04;
/// A top-up shorter than this is not made: nobody hears it.
const MIN_ADD_SECONDS: f64 = 0.04;
/// The next word may be quiet a little past the start the aligner gives it.
const ONSET_SECONDS: f64 = 0.02;
/// The speech either side of a breath's zeros fades over this long.
pub(super) const FADE_SECONDS: f64 = 0.006;

/// The zeros each of `breaths` (words before it, seconds) needs, in script
/// order. A breath before the first word or after the last, and one the
/// voice's own silence already covers, needs none. Two that land on one
/// spot ("a, a" said as one sound has no gap to cut) keep the later.
pub(super) fn top_ups(
    samples: &[f32],
    rate: u32,
    words: &[WordTime],
    breaths: &[(usize, f64)],
) -> Vec<Insert> {
    if breaths.is_empty() {
        return Vec::new();
    }
    let quiet = quiet_runs(samples, rate);
    let at = |t: f64| ((t * f64::from(rate)).round().max(0.0) as usize).min(samples.len());
    let mut out: Vec<Insert> = Vec::new();
    for &(k, want) in breaths {
        let before = words.iter().filter(|w| w.index < k).map(|w| w.end);
        let after = words.iter().filter(|w| w.index >= k).map(|w| w.start);
        let (Some(a), Some(b)) = (before.reduce(f64::max), after.reduce(f64::min)) else {
            continue;
        };
        let (lo, hi) = (at(a), at(b + ONSET_SECONDS));
        let between = || quiet.iter().filter(|r| r.1 > lo && r.0 < hi);
        let have: usize = between().map(|r| r.1 - r.0).sum();
        let add = want - have as f64 / f64::from(rate);
        if add < MIN_ADD_SECONDS {
            continue;
        }
        let longest = between().max_by_key(|r| r.1 - r.0);
        let cut = longest.map_or_else(|| cut(samples, rate, words, k), |r| (r.0 + r.1) / 2);
        let fade = (FADE_SECONDS * f64::from(rate)).round() as usize;
        if out.last().is_some_and(|last| cut < last.at + 2 * fade) {
            out.pop();
        }
        out.push(Insert {
            words: k,
            at: cut,
            zeros: (add * f64::from(rate)).round() as usize,
            breath: true,
        });
    }
    out
}

/// The clip's quiet stretches of `MIN_RUN_SECONDS` or more, as sample
/// ranges, by frame RMS.
fn quiet_runs(samples: &[f32], rate: u32) -> Vec<(usize, usize)> {
    let hop = ((FRAME_SECONDS * f64::from(rate)).round() as usize).max(1);
    let rms: Vec<f32> = samples
        .chunks_exact(hop)
        .map(|f| (f.iter().map(|s| s * s).sum::<f32>() / hop as f32).sqrt())
        .collect();
    if rms.is_empty() {
        return Vec::new();
    }
    let mut sorted = rms.clone();
    sorted.sort_by(f32::total_cmp);
    let p95 = sorted[((sorted.len() - 1) as f64 * 0.95).round() as usize];
    let threshold = (QUIET * p95).max(QUIET_FLOOR);
    let min_frames = (MIN_RUN_SECONDS / FRAME_SECONDS).round() as usize;
    let mut runs = Vec::new();
    let mut from = None;
    for (i, quiet) in rms
        .iter()
        .map(|&r| r < threshold)
        .chain([false])
        .enumerate()
    {
        match (quiet, from) {
            (true, None) => from = Some(i),
            (false, Some(start)) => {
                if i - start >= min_frames {
                    runs.push((start * hop, i * hop));
                }
                from = None;
            }
            _ => {}
        }
    }
    runs
}
