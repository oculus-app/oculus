//! A scene's beats in a few lines, for an agent that re-reads every byte:
//! one line per moment (the beats that start at one sample), with the
//! closest moments merged until at most `max` are left, and `--key`'s
//! filter for one entity's whole timeline.

use super::Beat;

/// Characters a summary line keeps; the rest is cut with `…`.
const LINE: usize = 84;

/// Beats that start together, or neighbours merged into one span.
struct Moment<'a> {
    t: f64,
    /// The start of its last beat.
    until: f64,
    beats: Vec<&'a Beat>,
}

impl Moment<'_> {
    fn pause(&self) -> bool {
        self.beats.iter().any(|b| b.event == "pause")
    }
}

impl Beat {
    /// Whether this beat moves `key`: one of its entities is the key or
    /// sits under it (`key/...`).
    pub fn is_about(&self, key: &str) -> bool {
        self.members.iter().any(|m| {
            m == key
                || m.strip_prefix(key)
                    .is_some_and(|rest| rest.starts_with('/') || rest.starts_with('#'))
        }) || self.who == key
    }

    /// At most `max` lines, one per moment: its time (a span once moments
    /// merge), each event with the entities it moves (`+3` for the ones
    /// cut), a lone beat's detail, and the words said. A `[pause]` keeps
    /// a line of its own while any other moments can merge.
    pub fn summary(beats: &[Beat], max: usize) -> Vec<String> {
        let mut moments: Vec<Moment> = Vec::new();
        for b in beats {
            match moments.last_mut() {
                Some(m) if m.t == b.t && b.event != "pause" && !m.pause() => m.beats.push(b),
                _ => moments.push(Moment {
                    t: b.t,
                    until: b.t,
                    beats: vec![b],
                }),
            }
        }
        while moments.len() > max.max(1) {
            let gap = |i: usize, pauses: bool| {
                let (a, b): (&Moment, &Moment) = (&moments[i], &moments[i + 1]);
                (pauses || !(a.pause() || b.pause())).then_some(b.t - a.until)
            };
            let closest = |pauses: bool| {
                (0..moments.len() - 1)
                    .filter_map(|i| gap(i, pauses).map(|g| (i, g)))
                    .min_by(|x, y| x.1.total_cmp(&y.1))
                    .map(|(i, _)| i)
            };
            let Some(i) = closest(false).or_else(|| closest(true)) else {
                break;
            };
            let next = moments.remove(i + 1);
            moments[i].until = next.until;
            moments[i].beats.extend(next.beats);
        }
        moments.iter().map(line).collect()
    }
}

fn line(m: &Moment) -> String {
    let time = if m.until > m.t {
        format!("{:6.2}-{:.2}", m.t, m.until)
    } else {
        format!("{:6.2}", m.t)
    };
    let words = m.beats[0].words.as_str();
    let tail = if words.is_empty() {
        String::new()
    } else {
        format!("  {words}")
    };
    let budget = LINE
        .saturating_sub(time.chars().count() + 2 + tail.chars().count())
        .max(24);
    let what = match m.beats.as_slice() {
        [b] => {
            let mut s = format!("{:<8} {}", b.event, b.who);
            if !b.detail.is_empty() {
                s.push_str("  ");
                s.push_str(&b.detail);
            }
            cut(&s, budget)
        }
        many => events(many, budget),
    };
    format!("{time}  {what}{tail}")
}

/// `appear a, b +4; move c`: each event in the order it first happens,
/// the entities it moves while they fit in `budget` characters, a count
/// for the rest.
fn events(beats: &[&Beat], budget: usize) -> String {
    let mut order: Vec<(&str, Vec<&str>)> = Vec::new();
    for b in beats {
        match order.iter_mut().find(|(e, _)| *e == b.event) {
            Some((_, who)) if !who.contains(&b.who.as_str()) => who.push(&b.who),
            Some(_) => {}
            None => order.push((&b.event, vec![&b.who])),
        }
    }
    let mut out = String::new();
    for (k, (event, who)) in order.iter().enumerate() {
        // Room for each later event's name and a count.
        let later: usize = order[k + 1..].iter().map(|(e, _)| e.len() + 6).sum();
        let room = budget.saturating_sub(out.chars().count() + later);
        if !out.is_empty() {
            out.push_str("; ");
        }
        let mut part = (*event).to_owned();
        let mut shown = 0;
        for (j, w) in who.iter().enumerate() {
            let sep = if j == 0 { " " } else { ", " };
            let left = who.len() - j - 1;
            let count = if left > 0 {
                format!(" +{left}").len()
            } else {
                0
            };
            if part.chars().count() + sep.len() + w.chars().count() + count + 2 > room {
                break;
            }
            part.push_str(sep);
            part.push_str(w);
            shown += 1;
        }
        if shown < who.len() {
            part.push_str(&format!(" +{}", who.len() - shown));
        }
        out.push_str(&part);
    }
    cut(&out, budget)
}

/// `s` in at most `max` characters, `…` marking a cut.
fn cut(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_owned();
    }
    let kept: String = s.chars().take(max.saturating_sub(1)).collect();
    format!("{}…", kept.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn beat(t: f64, event: &str, who: &str) -> Beat {
        Beat {
            t,
            end: t,
            event: event.to_owned(),
            who: who.to_owned(),
            detail: String::new(),
            words: String::new(),
            members: if event == "pause" {
                Vec::new()
            } else {
                vec![who.to_owned()]
            },
        }
    }

    #[test]
    fn beats_at_one_sample_share_a_line() {
        let beats = [
            beat(0.2, "appear", "a"),
            beat(0.2, "appear", "b"),
            beat(0.2, "move", "c"),
            beat(1.0, "vanish", "a"),
        ];
        let lines = Beat::summary(&beats, 20);
        assert_eq!(lines, ["  0.20  appear a, b; move c", "  1.00  vanish   a"]);
    }

    #[test]
    fn the_closest_moments_merge_until_max_are_left_and_pauses_stay_alone() {
        let mut beats: Vec<Beat> = (0..30)
            .map(|i| beat(i as f64 * 0.2, "appear", &format!("k{i}")))
            .collect();
        beats.insert(10, beat(1.9, "pause", "1.0 s"));
        let lines = Beat::summary(&beats, 6);
        assert_eq!(lines.len(), 6, "{lines:#?}");
        assert!(
            lines
                .iter()
                .any(|l| l.trim_start().starts_with("1.90  pause")),
            "{lines:#?}"
        );
        assert!(
            lines.iter().all(|l| l.chars().count() <= LINE),
            "{lines:#?}"
        );
        assert!(lines[0].contains('-'), "a merged span: {}", lines[0]);
    }

    #[test]
    fn a_long_list_ends_in_a_count() {
        let beats: Vec<Beat> = (0..40)
            .map(|i| beat(0.0, "appear", &format!("element-{i}")))
            .collect();
        let line = &Beat::summary(&beats, 20)[0];
        let count = line.rsplit(' ').next().unwrap();
        assert!(count.starts_with('+'), "the rest are counted: {line}");
        assert!(line.chars().count() <= LINE, "{line}");
    }

    #[test]
    fn a_key_matches_itself_and_what_sits_under_it() {
        let b = beat(0.0, "appear", "toy/left");
        assert!(b.is_about("toy/left"));
        assert!(b.is_about("toy"));
        assert!(!b.is_about("to"));
        assert!(!b.is_about("toy/left/label"));
    }
}
