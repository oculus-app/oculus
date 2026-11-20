//! Type too small to read in the chat player: a Text or Math set under
//! `SMALL_TEXT` of the frame's shorter side for longer than `SMALL_FOR`.
//! One error per entity, over every span it is small in.

use super::super::entities::Entity;
use super::super::limits::{PLAYER_PX, SMALL_FOR, SMALL_TEXT};
use super::super::sample::SceneLook;
use super::super::words::while_said;
use super::{Warning, span};

/// An entity's small spans so far.
struct Small {
    name: String,
    label: String,
    /// The smallest size in a kept span, and the Text it was.
    px: f64,
    text: Option<String>,
    /// The open span: its start, last sample, smallest size and its Text.
    open: Option<(f64, f64, f64, Option<String>)>,
    /// Closed spans longer than `SMALL_FOR`.
    spans: Vec<(f64, f64)>,
}

pub(super) fn check(look: &SceneLook, shown: &[Vec<Entity>], out: &mut Vec<Warning>) {
    let (w, h) = look.size;
    let side = w.min(h);
    let least = SMALL_TEXT * side;
    let mut found: Vec<Small> = Vec::new();
    for (s, entities) in look.samples.iter().zip(shown) {
        if s.t < look.head {
            continue;
        }
        let mut seen: Vec<usize> = Vec::new();
        for e in entities {
            let Some((px, text)) = e.font.as_ref().filter(|(px, _)| *px < least - 1e-6) else {
                continue;
            };
            let i = found
                .iter()
                .position(|f| f.name == e.name)
                .unwrap_or_else(|| {
                    found.push(Small {
                        name: e.name.clone(),
                        label: e.label.clone(),
                        px: f64::INFINITY,
                        text: None,
                        open: None,
                        spans: Vec::new(),
                    });
                    found.len() - 1
                });
            let small = &mut found[i];
            small.open = Some(match small.open.take() {
                Some((a, _, least, t)) if least <= *px => (a, s.t, least, t),
                Some((a, ..)) => (a, s.t, *px, text.clone()),
                None => (s.t, s.t, *px, text.clone()),
            });
            seen.push(i);
        }
        for (i, small) in found.iter_mut().enumerate() {
            if !seen.contains(&i) {
                close(small);
            }
        }
    }
    for mut small in found {
        close(&mut small);
        let (Some(&(a, _)), Some(&(_, b))) = (small.spans.first(), small.spans.last()) else {
            continue;
        };
        let what = match &small.text {
            Some(t) => format!("{} (\"{}\")", small.label, clip(t)),
            None => small.label.clone(),
        };
        let total: f64 = small.spans.iter().map(|(a, b)| b - a).sum();
        let player = small.px * PLAYER_PX / w;
        out.push(Warning {
            kind: "small_text",
            error: true,
            noun: "small text",
            short: format!("{} {} px {}", small.label, px(small.px), span(a, b)),
            message: format!(
                "{what} is set at {} px, under {} px (1/27 of the frame's {side:.0} px side), for {total:.1} s from {a:.1} s to {b:.1} s{}; the chat player is about {PLAYER_PX:.0} px wide, where it reads as {player:.0} px: set it at {} px or more, or say it instead of writing it",
                px(small.px),
                px(least),
                while_said(&look.words, a, b),
                px(least.ceil())
            ),
        });
    }
}

/// Ends the open span, keeping it when it is long enough.
fn close(small: &mut Small) {
    if let Some((a, b, px, text)) = small.open.take()
        && b - a > SMALL_FOR
    {
        small.spans.push((a, b));
        if px < small.px {
            (small.px, small.text) = (px, text);
        }
    }
}

/// `40`, or `13.3` when a whole number would hide the difference.
fn px(v: f64) -> String {
    if (v - v.round()).abs() < 0.05 {
        format!("{v:.0}")
    } else {
        format!("{v:.1}")
    }
}

/// The first few words of a text, `…` marking a cut.
pub(super) fn clip(text: &str) -> String {
    let one: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    match one.char_indices().nth(32) {
        Some((i, _)) => format!("{}…", one[..i].trim_end()),
        None => one,
    }
}
