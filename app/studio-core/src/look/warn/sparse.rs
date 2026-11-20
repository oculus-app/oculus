//! Content kept to a small part of the frame: everything shown fits in a
//! box narrower than `SPARSE_WIDTH` or shorter than `SPARSE_HEIGHT` of the
//! frame for longer than `SPARSE_FOR`. The box is every shown node's,
//! strokes and labels included, not ink. A `TitleCard` scene is a title on
//! purpose and is skipped.

use super::super::entities::Entity;
use super::super::limits::{SPARSE_FOR, SPARSE_HEIGHT, SPARSE_WIDTH, TITLE_CARD};
use super::super::sample::SceneLook;
use super::super::words::while_said;
use super::{Warning, span};
use vello_cpu::kurbo::Rect;

pub(super) fn check(look: &SceneLook, shown: &[Vec<Entity>], out: &mut Vec<Warning>) {
    if look.component == TITLE_CARD {
        return;
    }
    let (w, h) = look.size;
    // Each sample's share of the width and height, when under either floor.
    let shares: Vec<Option<(f64, f64)>> = look
        .samples
        .iter()
        .zip(shown)
        .map(|(s, e)| {
            if s.t < look.head {
                return None;
            }
            let (sw, sh) =
                cover(e, look.size).map_or((0.0, 0.0), |b| (b.width() / w, b.height() / h));
            (sw < SPARSE_WIDTH || sh < SPARSE_HEIGHT).then_some((sw, sh))
        })
        .collect();
    let samples = &look.samples;
    let mut i = 0;
    while i < samples.len() {
        let Some(first) = shares[i] else {
            i += 1;
            continue;
        };
        let (mut sw, mut sh) = first;
        let mut j = i;
        while let Some(Some((a, b))) = shares.get(j + 1) {
            (sw, sh) = (sw.max(*a), sh.max(*b));
            j += 1;
        }
        let (a, b) = (samples[i].t, samples[j].t);
        if b - a > SPARSE_FOR {
            let (pw, ph) = (sw * 100.0, sh * 100.0);
            out.push(Warning {
                kind: "sparse",
                error: true,
                noun: "sparse span",
                short: format!("{pw:.0}% x {ph:.0}% {}", span(a, b)),
                message: format!(
                    "everything on screen fits in at most {pw:.0}% of the frame's width and {ph:.0}% of its height from {a:.1} s to {b:.1} s{}; fill at least {:.0}% of the width and {:.0}% of the height: draw the picture larger, or put what it is about beside it",
                    while_said(&look.words, a, b),
                    SPARSE_WIDTH * 100.0,
                    SPARSE_HEIGHT * 100.0
                ),
            });
        }
        i = j + 1;
    }
}

/// The box every shown entity fits in, cut to the frame; `None` for none.
fn cover(entities: &[Entity], (w, h): (f64, f64)) -> Option<Rect> {
    let frame = Rect::new(0.0, 0.0, w, h);
    entities
        .iter()
        .map(|e| e.bbox.intersect(frame))
        .filter(|b| b.area() > 0.0)
        .reduce(|a, b| a.union(b))
}
