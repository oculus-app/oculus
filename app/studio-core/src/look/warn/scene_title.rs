//! A slide title: a Text centred in the top `TITLE_BAND` of the frame and
//! shown for more than `TITLE_SHARE` of the scene after its transition in.
//! A `TitleCard` scene is a title on purpose and is skipped.

use super::super::entities::{label, shown};
use super::super::limits::{TITLE_BAND, TITLE_CARD, TITLE_SHARE};
use super::super::sample::SceneLook;
use super::Warning;
use super::small_text::clip;
use crate::scene::Kind;

/// One entity's Text in the band: how long, from when, and what it says.
struct Held {
    entity: String,
    label: String,
    text: String,
    from: f64,
    secs: f64,
}

pub(super) fn check(look: &SceneLook, out: &mut Vec<Warning>) {
    let shown_for = look.length - look.head;
    if look.component == TITLE_CARD || shown_for <= 0.0 {
        return;
    }
    let (_, h) = look.size;
    let band = TITLE_BAND * h;
    let samples = &look.samples;
    let mut held: Vec<Held> = Vec::new();
    for (k, s) in samples.iter().enumerate() {
        if s.t < look.head {
            continue;
        }
        let next = samples.get(k + 1).map_or(look.length, |n| n.t);
        let weight = (next - s.t).max(0.0);
        let mut counted: Vec<usize> = Vec::new();
        for item in &s.items {
            let Some(text) = item.text.as_deref().filter(|t| !t.trim().is_empty()) else {
                continue;
            };
            if item.kind != Kind::Text || !shown(item, look.size) || item.bbox.center().y > band {
                continue;
            }
            let i = held
                .iter()
                .position(|e| e.entity == item.entity)
                .unwrap_or_else(|| {
                    held.push(Held {
                        entity: item.entity.clone(),
                        label: label(item, &look.component),
                        text: text.to_owned(),
                        from: s.t,
                        secs: 0.0,
                    });
                    held.len() - 1
                });
            if !counted.contains(&i) {
                held[i].secs += weight;
                counted.push(i);
            }
        }
    }
    for e in held
        .into_iter()
        .filter(|e| e.secs > TITLE_SHARE * shown_for)
    {
        out.push(Warning {
            kind: "scene_title",
            error: true,
            noun: "scene title",
            short: e.label.clone(),
            message: format!(
                "{} (\"{}\") sits in the top {:.0}% of the frame for {:.1} s of the scene's {:.1} s, from {:.1} s: a slide title; say it in the narration, or let the picture's own labels name it, and give the frame to the picture",
                e.label,
                clip(&e.text),
                TITLE_BAND * 100.0,
                e.secs,
                look.length,
                e.from
            ),
        });
    }
}
