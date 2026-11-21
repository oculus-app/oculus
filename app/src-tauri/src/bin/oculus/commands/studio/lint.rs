//! `oculus studio lint`: `Project::lint` (or `lint_scene`) plus the checks
//! that need the narration engine (`voice::lint`) or the library (a slide
//! whose PDF changed, `slides::lint`), printed short: errors, then
//! warnings, then notes, one problem a line (where, what, the fix, a fix
//! said once) cut to `LINE` characters, a scene's notes of one kind on
//! one line with a count and the first few, at most `MAX_LINES` lines and
//! a count of the rest (`--all` prints every problem in full).

use super::studio_error;
use crate::*;
use app_lib::studio::tts::kokoro::{self, LexiconFiles};
use app_lib::studio::voice::lint::{Note, VoiceLint};
use app_lib::studio::voice::review::Store;
use app_lib::studio::voice::{self, VoiceOverrides};
use app_lib::studio::{brief, libraries, slides, videos};
use studio_core::{LintIssue, LintLevel, Project};

/// Examples a grouped line shows before `…`.
const GROUP_EXAMPLES: usize = 3;
/// Lines printed before the rest are counted, unless `--all`.
pub(super) const MAX_LINES: usize = 15;
/// Characters a line keeps, unless `--all`.
const LINE: usize = 120;
/// The longest text after a line's last `; ` that counts as its fix,
/// printed on the first line that has it and left off the rest.
const FIX: usize = 60;
/// Characters a quote in a cut line keeps, tried in turn until the line
/// fits.
const QUOTES: [usize; 3] = [24, 10, 0];

impl Ctx {
    pub(crate) fn studio_lint(&self, args: &StudioLintArgs) -> Result<(), String> {
        let project = libraries::open(&args.dir, None, None).map_err(studio_error)?;
        let scope = match &args.scene {
            Some(s) => Some(brief::scene_index(&project, s)?),
            None => None,
        };
        let mut report = match scope {
            Some(i) => project.lint_scene(i),
            None => project.lint(),
        }
        .map_err(studio_error)?;
        report.issues.extend(app_lib::studio::series::lint(
            &project,
            &app_lib::studio::videos::videos_dir(),
        ));
        let mut spoken = voice_lint(&project);
        if let Some(i) = scope {
            spoken.issues.retain(|x| x.scene.is_none_or(|s| s == i));
            spoken.notes.retain(|n| n.scene == i);
        }
        Store::app().annotate(project.video.subject.as_deref(), &mut spoken.notes);
        report.issues.extend(spoken.issues);
        let mut stale = slides::lint(&project, &self.data_dir);
        if let Some(i) = scope {
            stale.retain(|x| x.scene.is_none_or(|s| s == i));
        }
        report.issues.extend(stale);
        let errors = report.errors();
        let dir = std::path::absolute(&args.dir).unwrap_or_else(|_| args.dir.clone());
        let name = brief::target(&dir, &videos::videos_dir());

        if self.json {
            let entries: Vec<serde_json::Value> = report
                .issues
                .iter()
                .map(issue_json)
                .chain(spoken.notes.iter().map(note_json))
                .collect();
            self.emit(&entries)?;
        } else {
            print!("{}", text(&report.issues, &spoken.notes, args.all));
            let rest = report.issues.len() - errors + spoken.notes.len();
            if errors == 0 {
                let what = match scope {
                    Some(i) => format!("{name} scene {i}"),
                    None => format!(
                        "{name} ({} scenes, {:.3} s)",
                        project.video.scenes.len(),
                        project.length().map_err(studio_error)?
                    ),
                };
                let head = if rest == 0 {
                    "no problems"
                } else {
                    "no errors"
                };
                println!(
                    "{} {what}{}",
                    paint(head, GREEN),
                    counts(&report.issues, &spoken.notes)
                );
            }
        }
        if errors == 0 {
            return Ok(());
        }
        // The JSON form's error names the folder in full, as it always has.
        let place = if self.json {
            args.dir.display().to_string()
        } else {
            name
        };
        Err(format!(
            "{errors} error{} in {place}",
            if errors == 1 { "" } else { "s" },
        ))
    }
}

/// ` · 2 warnings, 5 notes`, or nothing.
fn counts(issues: &[LintIssue], notes: &[Note]) -> String {
    let warnings = issues
        .iter()
        .filter(|i| i.level == LintLevel::Warning)
        .count();
    let n = issues.iter().filter(|i| i.level == LintLevel::Note).count() + notes.len();
    let mut parts = Vec::new();
    if warnings > 0 {
        parts.push(plural(warnings, "warning"));
    }
    if n > 0 {
        parts.push(plural(n, "note"));
    }
    if parts.is_empty() {
        return String::new();
    }
    format!(" · {}", parts.join(", "))
}

fn plural(n: usize, noun: &str) -> String {
    format!("{n} {noun}{}", if n == 1 { "" } else { "s" })
}

/// One printed line: its level, how many problems it stands for (a
/// grouped line stands for several), where (bold in a terminal) and what.
struct Line {
    level: LintLevel,
    problems: usize,
    place: String,
    text: String,
}

impl Line {
    /// The line, cut to `LINE` characters unless `all`; a fix (the text
    /// after the last `; `) already in `fixes` is left out.
    fn render(&self, all: bool, fixes: &mut Vec<String>) -> String {
        let label = match self.level {
            LintLevel::Error => String::new(),
            level => format!("{} ", paint(&format!("{}:", level.name()), BOLD)),
        };
        let label_len = match self.level {
            LintLevel::Error => 0,
            level => level.name().len() + 2,
        };
        let (place, sep) = match self.place.is_empty() {
            true => (String::new(), ""),
            false => (paint(&self.place, BOLD), " "),
        };
        let used = label_len + self.place.chars().count() + sep.len();
        let text = if all {
            self.text.clone()
        } else {
            let text = match self.text.rsplit_once("; ") {
                Some((what, fix)) if fix.chars().count() <= FIX => {
                    if fixes.iter().any(|f| f == fix) {
                        what.to_owned()
                    } else {
                        fixes.push(fix.to_owned());
                        self.text.clone()
                    }
                }
                _ => self.text.clone(),
            };
            fit(&text, LINE.saturating_sub(used).max(40))
        };
        format!("{label}{place}{sep}{text}")
    }
}

/// Every problem as a line: errors, then warnings, then notes, a scene's
/// notes of one kind on one line. Any lint kind prints this way: a kind
/// with no `group` name groups under its own `kind`.
fn lines(issues: &[LintIssue], notes: &[Note], all: bool) -> Vec<Line> {
    let mut out: Vec<Line> = Vec::new();
    for level in [LintLevel::Error, LintLevel::Warning] {
        for issue in issues.iter().filter(|i| i.level == level) {
            let message = issue.error.to_string();
            let text = match all {
                true => message,
                false => message.lines().next().unwrap_or_default().to_owned(),
            };
            let (place, text) = match (place(issue), level) {
                (Some(p), LintLevel::Error) => (p, text),
                (Some(p), _) => (format!("{p}:"), text),
                (None, LintLevel::Error) => (String::new(), text),
                (None, _) => ("video:".to_owned(), text),
            };
            out.push(Line {
                level,
                problems: 1,
                place,
                text,
            });
        }
    }
    let mut entries: Vec<Entry> = issues
        .iter()
        .filter(|i| i.level == LintLevel::Note)
        .map(|issue| {
            let (noun, short) = issue.group.clone().unwrap_or_else(|| {
                let first = issue.error.to_string();
                (
                    issue.error.kind(),
                    fit(first.lines().next().unwrap_or(""), 40),
                )
            });
            Entry {
                scene: issue.scene,
                place: place(issue).unwrap_or_else(|| "video".to_owned()),
                noun,
                short,
                full: issue.error.to_string(),
            }
        })
        .collect();
    entries.extend(notes.iter().map(|n| Entry {
        scene: Some(n.scene),
        place: format!("scene {} `{}`", n.scene, n.id),
        noun: "guessed word",
        short: match &n.review {
            Some(r) => format!("\"{}\" script.md:{} {}", n.word, n.line, r.suffix()),
            None => format!("\"{}\" script.md:{}", n.word, n.line),
        },
        full: format!("script.md:{}: {}", n.line, n.message()),
    }));
    let mut done = vec![false; entries.len()];
    for i in 0..entries.len() {
        if done[i] {
            continue;
        }
        let e = &entries[i];
        let same: Vec<usize> = (i..entries.len())
            .filter(|&j| !done[j] && entries[j].scene == e.scene && entries[j].noun == e.noun)
            .collect();
        for &j in &same {
            done[j] = true;
        }
        let text = if same.len() == 1 {
            e.full.clone()
        } else {
            let shown: Vec<&str> = same
                .iter()
                .take(if all { same.len() } else { GROUP_EXAMPLES })
                .map(|&j| entries[j].short.as_str())
                .collect();
            let more = if shown.len() < same.len() {
                ", …"
            } else {
                ""
            };
            format!("{} {}s: {}{more}", same.len(), e.noun, shown.join(", "))
        };
        out.push(Line {
            level: LintLevel::Note,
            problems: same.len(),
            place: format!("{}:", e.place),
            text,
        });
    }
    out
}

/// A note in a scene, ready to group: its scene, noun, short form and
/// full line.
struct Entry {
    scene: Option<usize>,
    place: String,
    noun: &'static str,
    short: String,
    full: String,
}

/// What `lint` prints before its last line: every problem with `all`,
/// else the first `MAX_LINES` lines and a count of the rest.
pub(super) fn text(issues: &[LintIssue], notes: &[Note], all: bool) -> String {
    let lines = lines(issues, notes, all);
    let shown = if all {
        lines.len()
    } else {
        lines.len().min(MAX_LINES)
    };
    let mut out = String::new();
    let mut fixes = Vec::new();
    for l in &lines[..shown] {
        out.push_str(&l.render(all, &mut fixes));
        out.push('\n');
    }
    let left = &lines[shown..];
    if !left.is_empty() {
        let count = |level| -> usize {
            left.iter()
                .filter(|l| l.level == level)
                .map(|l| l.problems)
                .sum()
        };
        let parts: Vec<String> = [
            (LintLevel::Error, "error"),
            (LintLevel::Warning, "warning"),
            (LintLevel::Note, "note"),
        ]
        .into_iter()
        .map(|(level, noun)| (count(level), noun))
        .filter(|(n, _)| *n > 0)
        .map(|(n, noun)| plural(n, noun))
        .collect();
        out.push_str(&format!(
            "… and {} not shown; --all prints every one\n",
            parts.join(", ")
        ));
    }
    out
}

/// `s` in at most `max` characters: whole when it fits, else with its
/// quotes cut to their first words (`"is built from …"`) or to `"…"`,
/// then its start cut with `…`, keeping a short fix after its last `; `
/// whole.
fn fit(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_owned();
    }
    let mut s = s.to_owned();
    for quote in QUOTES {
        s = short_quotes(&s, quote);
        if s.chars().count() <= max {
            return s;
        }
    }
    let tail = s
        .rfind("; ")
        .map(|at| &s[at..])
        .filter(|t| t.chars().count() <= FIX.min(max / 2 + 10))
        .unwrap_or("");
    let keep = max.saturating_sub(tail.chars().count() + 1);
    let head: String = s.chars().take(keep).collect();
    format!("{}…{tail}", head.trim_end())
}

/// `s` with each `"…"` quote over `max` characters cut to the words
/// that fit and `…`.
fn short_quotes(s: &str, max: usize) -> String {
    let mut out = String::new();
    let mut parts = s.split('"');
    out.push_str(parts.next().unwrap_or_default());
    let rest: Vec<&str> = parts.collect();
    for (i, part) in rest.iter().enumerate() {
        out.push('"');
        // Odd pieces sit inside quotes, when a closing quote follows.
        let inside = i % 2 == 0 && i + 1 < rest.len();
        if inside && part.chars().count() > max {
            let mut kept = String::new();
            for w in part.split(' ') {
                if kept.chars().count() + w.chars().count() + 1 > max {
                    break;
                }
                kept.push_str(w);
                kept.push(' ');
            }
            out.push_str(&kept);
            out.push('…');
        } else {
            out.push_str(part);
        }
    }
    out
}

/// The checks that need the narration engine (`voice::lint`), with the
/// voice `narrate` would resolve without flags. A voice that does not
/// resolve is `narrate`'s to report.
fn voice_lint(project: &Project) -> VoiceLint {
    let block = project
        .video
        .voice
        .as_ref()
        .map(VoiceOverrides::from)
        .unwrap_or_default();
    match voice::resolve(&VoiceOverrides::default(), &block, &voice::settings()) {
        Ok(v) => voice::lint::lint(
            project,
            &v,
            &kokoro::dir(),
            &LexiconFiles::app(project.video.subject.as_deref()),
        ),
        Err(_) => VoiceLint::default(),
    }
}

fn note_json(note: &Note) -> serde_json::Value {
    serde_json::json!({
        "level": "note",
        "scene": note.scene,
        "id": note.id,
        "line": note.line,
        "kind": if note.others.is_empty() { "guessed" } else { "reading" },
        "message": note.message(),
        "word": note.word,
        "phonemes": note.phonemes,
        "guessed": note.guessed,
        "others": note.others,
        "review": note.review,
    })
}

/// Where an issue is (`scene 2 \`update\` (Steps)`), or `None` when the
/// error names its own place (`script.md:7: ...`).
fn place(issue: &LintIssue) -> Option<String> {
    let id = issue
        .id
        .as_ref()
        .map(|id| format!(" `{id}`"))
        .unwrap_or_default();
    let component = issue.component.as_deref();
    Some(match (issue.scene, &issue.example, component) {
        (Some(i), _, Some(c)) => format!("scene {i}{id} ({c})"),
        (Some(i), _, None) => format!("scene {i}{id}"),
        (None, Some(e), Some(c)) => format!("{c} example `{e}`"),
        (None, _, Some(c)) => c.to_owned(),
        (None, _, None) => return None,
    })
}

fn issue_json(issue: &LintIssue) -> serde_json::Value {
    let e = &issue.error;
    serde_json::json!({
        "level": issue.level.name(),
        "scene": issue.scene,
        "id": issue.id,
        "component": issue.component,
        "example": issue.example,
        "kind": e.kind(),
        "message": e.to_string(),
        "loc": e.loc().map(|l| serde_json::json!({
            "line": l.line,
            "col": l.col,
            "snippet": l.snippet.trim(),
        })),
    })
}

#[cfg(test)]
mod tests {
    use super::fit;

    #[test]
    fn a_long_line_loses_its_quote_before_its_span_or_fix() {
        let line = "nothing on screen changes from 22.5 s to 25.9 s while the narration says \
                    \"content locally. That repeatable collection is called scraping.\"; \
                    give those words something to show";
        let short = fit(line, 125);
        assert!(short.chars().count() <= 125, "{short}");
        assert!(
            short.contains("to 25.9 s while the narration says \"content ")
                && short.ends_with("…\"; give those words something to show"),
            "{short}"
        );
        assert_eq!(fit("short", 110), "short");
        let cut = fit(&"x".repeat(200), 50);
        assert_eq!(cut.chars().count(), 50);
        assert!(cut.ends_with('…'));
    }
}
