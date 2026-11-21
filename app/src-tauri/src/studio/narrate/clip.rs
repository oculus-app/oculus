//! One scene's clip: the section said in one go and timed in one pass, as
//! without pauses, then each `[pause]` spliced in as exact silence at the
//! quietest moment between the words either side of it, and each `[breath]`
//! topped up (`breath`), the times after either moved on by its zeros.
//! Saying the words whole keeps the voice's pace: Kokoro paces an input by
//! its length, so parts said apart came out up to 11% slower than the same
//! words said whole. A server is asked once, too. A clip nothing was put
//! into is the speaker's WAV byte for byte.

use std::time::Instant;

use studio_core::{ManifestGap, ManifestPause, ManifestWord};

use super::breath::{self, FADE_SECONDS};
use super::{Aligner, Said, Speaker, Timings};
use crate::studio::audio::{encode_wav, resample_to_16k};
use crate::studio::timing::{Gap, WordTime};
use crate::studio::tts::Speech;

/// A made clip and what its manifest entry records.
pub(super) struct Made {
    pub wav: Vec<u8>,
    pub duration: f64,
    pub words: Vec<ManifestWord>,
    pub gaps: Vec<ManifestGap>,
    pub pauses: Vec<ManifestPause>,
    pub timings: Timings,
}

/// `said`'s clip: its voiced text spoken, its words as written timed, and
/// its pauses and breaths put in.
pub(super) fn make(
    said: &Said,
    speaker: &dyn Speaker,
    aligner: &dyn Aligner,
) -> Result<Made, String> {
    let (spoken, pauses, breaths) = (&said.spoken, &said.pauses, &said.breaths);
    let started = Instant::now();
    let Speech { wav, decoded } = speaker.speak(&said.voiced)?;
    let synth_ms = started.elapsed().as_millis() as u64;
    let started = Instant::now();
    let rate = decoded.sample_rate;
    let pcm = resample_to_16k(&decoded.samples, rate).map_err(|e| e.to_string())?;
    let script: Vec<String> = spoken.split_whitespace().map(str::to_owned).collect();
    let alignment = aligner.align(&pcm, &script).map_err(|e| e.to_string())?;
    drop(pcm);
    let timings = Timings {
        synth_ms,
        align_ms: started.elapsed().as_millis() as u64,
    };
    let seconds = |n: usize| n as f64 / f64::from(rate);
    let inserts = inserts(&decoded.samples, rate, &alignment.words, pauses, breaths);
    let spliced = splice(&decoded.samples, rate, &alignment.words, &inserts);
    // A word moves by the zeros put in before it; a gap by those cut before it.
    let words = alignment.words.iter().map(|w| {
        let before = inserts.iter().filter(|i| w.index >= i.words);
        word(w, seconds(before.map(|i| i.zeros).sum()))
    });
    let gaps = alignment.gaps.iter().map(|g| {
        let at = (g.start * f64::from(rate)).round() as usize;
        let before = spliced.cuts.iter().zip(&inserts).filter(|(c, _)| **c <= at);
        gap(g, seconds(before.map(|(_, i)| i.zeros).sum()))
    });
    let (words, gaps) = (words.collect(), gaps.collect());
    if inserts.is_empty() {
        return Ok(Made {
            wav,
            duration: decoded.duration,
            words,
            gaps,
            pauses: Vec::new(),
            timings,
        });
    }
    Ok(Made {
        wav: encode_wav(&spliced.samples, rate)?,
        duration: seconds(spliced.samples.len()),
        words,
        gaps,
        pauses: spliced.pauses,
        timings,
    })
}

fn word(w: &WordTime, shift: f64) -> ManifestWord {
    ManifestWord {
        text: w.text.clone(),
        start: w.start + shift,
        end: w.end + shift,
        confidence: w.confidence,
    }
}

fn gap(g: &Gap, shift: f64) -> ManifestGap {
    ManifestGap {
        after: g.after,
        start: g.start + shift,
        end: g.end + shift,
        heard: g.heard.clone(),
    }
}

/// Silence to put into a clip: `zeros` samples before sample `at` of the
/// clip as spoken, after `words` script words. A breath's fades the speech
/// either side of it; a pause's goes into the manifest.
pub(super) struct Insert {
    pub words: usize,
    pub at: usize,
    pub zeros: usize,
    pub breath: bool,
}

/// Every pause and breath top-up in script order, a pause before a breath
/// at the same place.
fn inserts(
    samples: &[f32],
    rate: u32,
    words: &[WordTime],
    pauses: &[(usize, f64)],
    breaths: &[(usize, f64)],
) -> Vec<Insert> {
    let mut all: Vec<Insert> = pauses
        .iter()
        .map(|&(k, seconds)| Insert {
            words: k,
            at: cut(samples, rate, words, k),
            zeros: (seconds * f64::from(rate)).round() as usize,
            breath: false,
        })
        .collect();
    all.extend(breath::top_ups(samples, rate, words, breaths));
    all.sort_by_key(|i| (i.words, i.breath));
    all
}

/// A clip with its silences in.
struct Spliced {
    samples: Vec<f32>,
    /// Per insert: the sample of the clip as spoken it went before.
    cuts: Vec<usize>,
    pauses: Vec<ManifestPause>,
}

/// `samples` with each insert's zeros at its cut, never before the one
/// ahead of it. Without inserts it copies nothing.
fn splice(samples: &[f32], rate: u32, words: &[WordTime], inserts: &[Insert]) -> Spliced {
    let mut spliced = Spliced {
        samples: Vec::new(),
        cuts: Vec::with_capacity(inserts.len()),
        pauses: Vec::new(),
    };
    if inserts.is_empty() {
        return spliced;
    }
    let fade = (FADE_SECONDS * f64::from(rate)).round() as usize;
    let out = &mut spliced.samples;
    let mut from = 0;
    let mut fade_in = false;
    for i in inserts {
        let c = i.at.max(from);
        extend(out, &samples[from..c], fade, fade_in, i.breath);
        from = c;
        fade_in = i.breath;
        let start = out.len() as f64 / f64::from(rate);
        out.resize(out.len() + i.zeros, 0.0);
        if !i.breath {
            spliced.pauses.push(ManifestPause {
                after: words.iter().rposition(|w| w.index < i.words),
                start,
                end: out.len() as f64 / f64::from(rate),
            });
        }
        spliced.cuts.push(c);
    }
    extend(out, &samples[from..], fade, fade_in, false);
    spliced
}

/// Appends `part`, its first `fade` samples rising from silence (`fade_in`)
/// and its last falling to it (`fade_out`): a raised cosine, so a cut into
/// running speech does not click.
fn extend(out: &mut Vec<f32>, part: &[f32], fade: usize, fade_in: bool, fade_out: bool) {
    let at = out.len();
    out.extend_from_slice(part);
    let n = fade.min(part.len());
    let ramp = |j: usize| 0.5 * (1.0 - (std::f32::consts::PI * (j as f32 + 0.5) / n as f32).cos());
    if fade_in {
        for j in 0..n {
            out[at + j] *= ramp(j);
        }
    }
    if fade_out {
        let end = out.len();
        for j in 0..n {
            out[end - 1 - j] *= ramp(j);
        }
    }
}

/// Half the span whose energy places a cut: 5 ms either side.
const CUT_HALF_SECONDS: f64 = 0.005;

/// The sample a pause after `k` script words goes before: the clip's start
/// before the first word, its end after the last, else the quietest 10 ms
/// between the last word before it ending and the next one starting (ties
/// to the middle), so the cut lands in the silence the voice left there.
pub(super) fn cut(samples: &[f32], rate: u32, words: &[WordTime], k: usize) -> usize {
    let at = |t: f64| ((t * f64::from(rate)).round().max(0.0) as usize).min(samples.len());
    let before = words.iter().filter(|w| w.index < k).map(|w| w.end);
    let after = words.iter().filter(|w| w.index >= k).map(|w| w.start);
    let (a, b) = match (before.reduce(f64::max), after.reduce(f64::min)) {
        (None, _) => return 0,
        (_, None) => return samples.len(),
        (Some(a), Some(b)) => (at(a), at(b)),
    };
    if b <= a {
        return a;
    }
    let half = (CUT_HALF_SECONDS * f64::from(rate)).round() as usize;
    let energy = |c: usize| -> f64 {
        let span = &samples[c.saturating_sub(half)..(c + half).min(samples.len())];
        span.iter().map(|&s| f64::from(s).powi(2)).sum()
    };
    let middle = (a + b) / 2;
    (a..=b)
        .step_by((half / 2).max(1))
        .map(|c| (energy(c), c.abs_diff(middle), c))
        .min_by(|x, y| x.0.total_cmp(&y.0).then(x.1.cmp(&y.1)))
        .map_or(a, |(_, _, c)| c)
}
