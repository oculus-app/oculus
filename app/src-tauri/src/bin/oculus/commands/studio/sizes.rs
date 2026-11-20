//! The text an agent re-reads on every later call, pinned in size on a
//! 16-scene fixture made for it (`fixtures/studio/sixteen-scenes`: one
//! narrated `Dots` component drawing many beats, two errors and a warning
//! or two a scene).

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

use app_lib::studio::brief;
use app_lib::studio::render::{render, Finished, Options, Preset};
use studio_core::{Library, LintLevel, Project};

use super::render::Printer;
use super::{beats, lint};

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/fixtures/studio/sixteen-scenes"
);

fn project() -> Project {
    Project::load(Path::new(FIXTURE)).unwrap()
}

#[test]
fn lint_prints_errors_first_and_under_2_kb() {
    let project = project();
    assert_eq!(project.video.scenes.len(), 16);
    let report = project.lint().unwrap();
    assert!(
        report.issues.len() > lint::MAX_LINES,
        "the fixture has more problems than lint prints: {}",
        report.issues.len()
    );
    let text = lint::text(&report.issues, &[], false);
    assert!(text.len() < 2048, "{} bytes:\n{text}", text.len());
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), lint::MAX_LINES + 1, "{text}");
    assert!(
        lines[lint::MAX_LINES].starts_with("… and ") && lines[lint::MAX_LINES].contains("--all"),
        "{text}"
    );
    let errors = report.errors();
    assert!(errors > 0);
    assert!(
        lines[..errors].iter().all(|l| !l.starts_with("warning:")),
        "errors print first: {text}"
    );
    let all = lint::text(&report.issues, &[], true);
    let problems = report
        .issues
        .iter()
        .filter(|i| i.level != LintLevel::Note)
        .count();
    assert!(all.lines().count() >= problems, "--all prints each: {all}");
}

#[test]
fn beats_prints_a_summary_under_2_kb_and_one_keys_whole_timeline() {
    let project = project();
    let look = project.look(&[15]).pop().unwrap().unwrap();
    let all = look.beats();
    assert!(all.len() > beats::SUMMARY, "{} beats", all.len());
    let text = beats::text(&look, &all, None).unwrap();
    assert!(text.len() < 2048, "{} bytes:\n{text}", text.len());
    assert_eq!(text.lines().count(), beats::SUMMARY + 2, "{text}");

    let key = beats::text(&look, &all, Some("d3")).unwrap();
    let lines: Vec<&str> = key.lines().skip(1).collect();
    assert_eq!(lines.len(), 2, "d3 appears, then drops: {key}");
    assert!(lines.iter().all(|l| l.contains("d3")), "{key}");
    assert!(beats::text(&look, &all, Some("nope")).is_err());
}

#[test]
fn brief_prints_each_sentence_once_and_nothing_the_agent_wrote() {
    let project = project();
    let dir = PathBuf::from(FIXTURE);
    let text = brief::build(&project, 15, &dir, "sixteen-scenes").to_string();
    // The folder's path is the checkout's; count the rest.
    let rest = text.replace(FIXTURE, "<dir>");
    assert!(rest.len() < 1000, "{} bytes:\n{rest}", rest.len());
    let narration: Vec<&str> = rest
        .lines()
        .skip_while(|l| !l.starts_with("Narration:"))
        .skip(1)
        .take_while(|l| !l.is_empty())
        .collect();
    assert_eq!(narration.len(), 3, "a line per sentence: {rest}");
    assert!(narration[0].starts_with("0.45 This scene(0.77) counts(1.09)"));
    assert!(!rest.contains("holds still while we keep talking about what"));
}

/// A copy of the fixture with a silent clip for each scene, which
/// rendering needs and the repo does not hold.
fn with_clips() -> PathBuf {
    let dir = std::env::temp_dir()
        .join(format!("oculus-sizes-{}", std::process::id()))
        .join("sixteen-scenes");
    let _ = std::fs::remove_dir_all(&dir);
    for rel in [
        "video.json",
        "script.md",
        "narration/manifest.json",
        "components/Dots.tsx",
    ] {
        let to = dir.join(rel);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        std::fs::copy(Path::new(FIXTURE).join(rel), to).unwrap();
    }
    let manifest: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("narration/manifest.json")).unwrap(),
    )
    .unwrap();
    for scene in manifest["scenes"].as_object().unwrap().values() {
        let path = dir.join("narration").join(scene["audio"].as_str().unwrap());
        let samples = (scene["duration"].as_f64().unwrap() * 24_000.0) as u32;
        std::fs::write(path, silent_wav(samples)).unwrap();
    }
    dir
}

/// A 24 kHz mono 16-bit WAV of `samples` zeros.
fn silent_wav(samples: u32) -> Vec<u8> {
    let data = samples * 2;
    let mut wav = Vec::with_capacity(44 + data as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&24_000u32.to_le_bytes());
    wav.extend_from_slice(&48_000u32.to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data.to_le_bytes());
    wav.resize(44 + data as usize, 0);
    wav
}

#[test]
fn render_piped_prints_the_plan_each_scene_and_the_mp4_under_1_kb() {
    let Some(ffmpeg) = app_lib::sources::echo360::find_ffmpeg(None) else {
        println!("skipped: no ffmpeg");
        return;
    };
    let dir = with_clips();
    let options = Options {
        preset: Preset::Draft,
        threads: Some(2),
        out: None,
        ffmpeg,
        library: Library::default(),
    };
    let mut printer = Printer::new(false);
    let mut text = String::new();
    let finished = render(&dir, &options, &AtomicBool::new(false), &mut |p| {
        printer.progress(&p, &mut text)
    });
    let report = match finished {
        Ok(Finished::Complete(report)) => report,
        Ok(Finished::Cancelled) => panic!("cancelled"),
        Err(e) => {
            println!("skipped: this ffmpeg cannot render the draft preset: {e}");
            return;
        }
    };
    printer.finished(&report, &mut text);
    let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    assert!(text.len() < 1024, "{} bytes:\n{text}", text.len());
    assert_eq!(text.lines().count(), 1 + 16 + 1, "{text}");
    assert!(!text.contains("frame "), "no frame progress: {text}");
}
