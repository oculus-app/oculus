//! `oculus studio render`: a video folder to an export preset's mp4
//! through `app_lib::studio::render` (docs/studio.md, "Rendering a video").
//! A terminal gets frame progress; piped output, which an agent re-reads
//! on every later call, gets only the plan, each scene rendered and the
//! mp4.

use super::studio_error;
use crate::*;
use app_lib::studio::libraries;
use app_lib::studio::render::{self, Finished, Outcome, Preset, Progress, Report, SegmentReport};
use std::fmt::Write as _;
use std::io::IsTerminal;
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

/// How often a segment's progress line is printed.
const EVERY: Duration = Duration::from_secs(2);

impl Ctx {
    pub(crate) fn studio_render(&self, args: &StudioRenderArgs) -> Result<(), String> {
        let preset = match (&args.preset, args.final_) {
            (Some(name), _) => Preset::parse(name)?,
            (None, true) => Preset::Final,
            (None, false) => Preset::Draft,
        };
        let ffmpeg = app_lib::sources::echo360::find_ffmpeg(None)
            .ok_or("ffmpeg not found; run `bun run ffmpeg` in app/, or install it")?;
        let options = render::Options {
            preset,
            threads: args.threads,
            out: args.out.clone(),
            ffmpeg,
            library: libraries::libraries(false).map_err(studio_error)?,
        };
        let quiet = self.json;
        let mut printer = Printer::new(std::io::stdout().is_terminal());
        let finished = render::render(&args.dir, &options, &AtomicBool::new(false), &mut |p| {
            if !quiet {
                let mut line = String::new();
                printer.progress(&p, &mut line);
                print!("{line}");
            }
        })
        .map_err(|e| e.to_string())?;
        let report = match finished {
            Finished::Complete(report) => report,
            Finished::Cancelled => return Err("cancelled".into()),
        };

        if self.json {
            return self.emit(&serde_json::json!({
                "dir": args.dir.to_string_lossy(),
                "report": report,
            }));
        }
        let mut end = String::new();
        printer.finished(&report, &mut end);
        print!("{end}");
        Ok(())
    }
}

/// Render's text: in a terminal the plan, frame progress every `EVERY`,
/// each scene rendered or cached, the files and a summary; piped, the
/// plan, each scene rendered and the mp4.
pub(super) struct Printer {
    terminal: bool,
    last: Instant,
}

impl Printer {
    pub(super) fn new(terminal: bool) -> Self {
        Printer {
            terminal,
            last: Instant::now(),
        }
    }

    pub(super) fn progress(&mut self, p: &Progress, out: &mut String) {
        match p {
            Progress::Planned {
                segments,
                cached,
                frames,
                threads,
            } => line(
                out,
                &paint(
                    &format!(
                        "{segments} scene{}: {cached} cached, {frames} frames to render on {threads} thread{}",
                        if *segments == 1 { "" } else { "s" },
                        if *threads == 1 { "" } else { "s" },
                    ),
                    DIM,
                ),
            ),
            Progress::Segment { .. } => self.last = Instant::now(),
            Progress::Frame {
                n,
                frame,
                frames,
                fps,
            } => {
                if self.terminal && self.last.elapsed() >= EVERY && frame < frames {
                    self.last = Instant::now();
                    line(
                        out,
                        &paint(
                            &format!(
                                "  scene {}: frame {frame} of {frames}, {fps:.1} frames/s",
                                n - 1
                            ),
                            DIM,
                        ),
                    );
                }
            }
            Progress::Done(s) if self.terminal => line(out, &segment(s)),
            Progress::Done(s) if s.outcome == Outcome::Rendered => line(out, &rendered(s)),
            Progress::Done(_) => {}
            Progress::Muxing if self.terminal => {
                line(out, &paint("joining the segments", DIM))
            }
            Progress::Muxing => {}
        }
    }

    pub(super) fn finished(&self, report: &Report, out: &mut String) {
        if !self.terminal {
            line(
                out,
                &format!(
                    "wrote {}, {:.2} s, in {:.1} s",
                    report.path.display(),
                    report.duration,
                    report.ms as f64 / 1000.0
                ),
            );
            return;
        }
        let rendered: Vec<&SegmentReport> = report
            .segments
            .iter()
            .filter(|s| s.outcome == Outcome::Rendered)
            .collect();
        line(
            out,
            &format!("{} {}", paint("wrote", GREEN), report.path.display()),
        );
        for path in &report.sidecars {
            line(
                out,
                &format!("{} {}", paint("wrote", GREEN), path.display()),
            );
        }
        let frames: u64 = rendered.iter().map(|s| s.frames).sum();
        let ms: u64 = rendered.iter().map(|s| s.ms).sum();
        let rate = if ms > 0 {
            format!(", {:.1} frames/s", frames as f64 * 1000.0 / ms as f64)
        } else {
            String::new()
        };
        line(
            out,
            &paint(
                &format!(
                    "  {} · {}×{} at {} fps · {} frames, {:.2} s{} · {} rendered{rate}, {} cached · {} thread{} · {:.1} s",
                    report.preset.name(),
                    report.width,
                    report.height,
                    report.fps,
                    report.frames,
                    report.duration,
                    if report.audio { " with narration" } else { "" },
                    rendered.len(),
                    report.segments.len() - rendered.len(),
                    report.threads,
                    if report.threads == 1 { "" } else { "s" },
                    report.ms as f64 / 1000.0
                ),
                DIM,
            ),
        );
    }
}

fn line(out: &mut String, text: &str) {
    let _ = writeln!(out, "{text}");
}

/// `scene 2 `steps`: 116 frames, 3.9 s`, for piped output.
fn rendered(s: &SegmentReport) -> String {
    let id =
        s.id.as_ref()
            .map(|id| format!(" `{id}`"))
            .unwrap_or_default();
    format!(
        "scene {}{id}: {} frames, {:.1} s",
        s.scene,
        s.frames,
        s.ms as f64 / 1000.0
    )
}

/// `scene 2 `steps`  rendered  116 frames  3.9 s  29.7 frames/s`.
fn segment(s: &SegmentReport) -> String {
    let id =
        s.id.as_ref()
            .map(|id| format!(" `{id}`"))
            .unwrap_or_default();
    let (outcome, colour) = match s.outcome {
        Outcome::Rendered => ("rendered", GREEN),
        Outcome::Cached => ("cached", DIM),
    };
    let timing = match s.fps {
        Some(fps) => format!("  {:.1} s  {fps:.1} frames/s", s.ms as f64 / 1000.0),
        None => String::new(),
    };
    format!(
        "{} {} {:>5} frames{}",
        paint(&format!("{:<20}", format!("scene {}{id}", s.scene)), BOLD),
        paint(&format!("{outcome:<8}"), colour),
        s.frames,
        paint(&timing, DIM)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frames(printer: &mut Printer) -> String {
        let mut out = String::new();
        printer.progress(
            &Progress::Segment {
                n: 1,
                of: 1,
                scene: 0,
            },
            &mut out,
        );
        printer.last -= EVERY;
        let frame = Progress::Frame {
            n: 1,
            frame: 10,
            frames: 100,
            fps: 30.0,
        };
        printer.progress(&frame, &mut out);
        out
    }

    #[test]
    fn a_terminal_gets_frame_progress_and_a_pipe_does_not() {
        assert_eq!(
            frames(&mut Printer::new(true)),
            "  scene 0: frame 10 of 100, 30.0 frames/s\n"
        );
        assert_eq!(frames(&mut Printer::new(false)), "");
    }

    #[test]
    fn a_pipe_gets_rendered_scenes_only() {
        let segment = |outcome| SegmentReport {
            scene: 2,
            id: Some("steps".into()),
            outcome,
            frames: 116,
            ms: 3_900,
            fps: Some(29.7),
        };
        let mut out = String::new();
        let mut printer = Printer::new(false);
        printer.progress(&Progress::Done(&segment(Outcome::Cached)), &mut out);
        printer.progress(&Progress::Muxing, &mut out);
        assert_eq!(out, "");
        printer.progress(&Progress::Done(&segment(Outcome::Rendered)), &mut out);
        assert_eq!(out, "scene 2 `steps`: 116 frames, 3.9 s\n");
    }
}
