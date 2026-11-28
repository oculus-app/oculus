//! The Studio page's commands over scratch folders: the list with its
//! links, the detail of a narrated and an unnarrated video, stills, and the
//! thumbnail cache. Narrated videos copy studio-core's `narrated`
//! fixture.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use studio_core::Library;

use super::frame::{frame_png, FrameAt, MAX_WIDTH};
use super::rows::list_in;
use super::thumbnail::thumbnail_in;
use super::{delete, detail::detail_in};
use crate::db::store::StudioLink;
use crate::studio::libraries::libraries_at;
use crate::studio::render::{Preset, RENDERS};
use crate::studio::voice::{Engine, VoiceSettings};
use crate::test_support::Scratch;

const FIXTURES: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../studio-core/tests/fixtures");

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap().flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

/// `videos/narrated`: the fixture whose `intro` scene is narrated (a 3 s clip
/// in the manifest, no audio file, which a still never reads).
fn narrated(videos: &Path) -> PathBuf {
    let dir = videos.join("narrated");
    copy_dir(&Path::new(FIXTURES).join("narrated"), &dir);
    dir
}

/// A scaffold as `oculus studio new` makes it.
fn scaffold(videos: &Path, slug: &str, title: &str) -> PathBuf {
    crate::studio::videos::create_in(
        videos,
        &crate::studio::videos::NewVideo {
            slug: slug.into(),
            title: Some(title.into()),
            theme: Some("default".into()),
            ..Default::default()
        },
    )
    .unwrap()
}

fn png_size(bytes: &[u8]) -> (u32, u32) {
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n", "not a PNG");
    let be = |at: usize| u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap());
    (be(16), be(20))
}

#[test]
fn deletion_refuses_while_any_preset_is_running() {
    let root = Scratch::new("cmd-delete-running");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    let _running = RENDERS.start(&dir, Preset::Draft).unwrap();
    let remove = |_: &Path| panic!("a running video's files must stay in place");
    let expected = "A draft render of this video is running. Cancel it first.";

    assert_eq!(RENDERS.running(&dir), Some(Preset::Draft));
    assert_eq!(
        delete::video_in(&videos, "narrated", &remove).unwrap_err(),
        expected
    );
    assert_eq!(
        delete::render_in(&videos, "narrated", "final", &remove).unwrap_err(),
        expected
    );
}

#[test]
fn deleting_a_render_releases_only_the_cache_files_it_alone_used() {
    let root = Scratch::new("cmd-delete-render");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    for folder in ["renders", ".cache/segments"] {
        std::fs::create_dir_all(dir.join(folder)).unwrap();
    }
    let removed = [
        "renders/draft.mp4",
        "renders/draft.vtt",
        ".cache/segments/draft.mp4",
        ".cache/narration-draft.wav",
    ];
    let kept = [
        "renders/final.mp4",
        "renders/final.vtt",
        ".cache/segments/final.mp4",
        ".cache/segments/shared.mp4",
        ".cache/narration-final.wav",
    ];
    for file in removed.into_iter().chain(kept) {
        std::fs::write(dir.join(file), b"fixture").unwrap();
    }
    let records = serde_json::json!({
        "draft": {
            "segments": ["draft.mp4", "shared.mp4"],
            "track": "narration-draft.wav",
            "out": "renders/draft.mp4"
        },
        "final": {
            "segments": ["final.mp4", "shared.mp4"],
            "track": "narration-final.wav",
            "out": "renders/final.mp4"
        }
    });
    let index = dir.join(".cache/renders.json");
    std::fs::write(&index, records.to_string()).unwrap();

    let error = delete::render_in(&videos, "narrated", "draft", &|path| {
        assert!(path.ends_with("draft.vtt"));
        Err("Could not move the captions to the Trash.".into())
    })
    .unwrap_err();
    assert!(error.contains("captions"));
    assert!(dir.join("renders/draft.mp4").is_file());
    assert_eq!(
        std::fs::read_to_string(&index).unwrap(),
        records.to_string()
    );

    delete::render_in(&videos, "narrated", "draft", &|path| {
        assert_eq!(path.parent().unwrap().file_name().unwrap(), "renders");
        std::fs::remove_file(path).map_err(|e| e.to_string())
    })
    .unwrap();
    for file in removed {
        assert!(!dir.join(file).exists(), "{file}");
    }
    for file in kept {
        assert!(dir.join(file).is_file(), "{file}");
    }
    let remaining: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&index).unwrap()).unwrap();
    assert_eq!(remaining, serde_json::json!({ "final": records["final"] }));
}

#[test]
fn deletion_rejects_a_bad_slug_or_missing_render() {
    let root = Scratch::new("cmd-delete-missing");
    let videos = root.join("videos");
    narrated(&videos);
    let remove = |_: &Path| panic!("nothing should be deleted");
    assert!(delete::video_in(&videos, "../narrated", &remove)
        .unwrap_err()
        .contains("not a video's slug"));
    assert!(delete::render_in(&videos, "../narrated", "draft", &remove)
        .unwrap_err()
        .contains("not a video's slug"));
    assert!(delete::render_in(&videos, "narrated", "draft", &remove)
        .unwrap_err()
        .contains("has no draft render"));
    assert!(delete::render_in(&videos, "narrated", "other", &remove)
        .unwrap_err()
        .contains("no export preset"));
}

#[test]
fn the_list_has_titles_threads_and_the_newest_first() {
    let root = Scratch::new("cmd-list");
    let videos = root.join("videos");
    let old = scaffold(&videos, "old-one", "Old one");
    let new = scaffold(&videos, "new-one", "New one");
    let past = std::time::SystemTime::now() - std::time::Duration::from_secs(3600);
    std::fs::File::options()
        .write(true)
        .open(old.join("video.json"))
        .unwrap()
        .set_modified(past)
        .unwrap();
    let links = HashMap::from([(
        "old-one".to_owned(),
        StudioLink {
            slug: "old-one".into(),
            thread_id: Some(7),
            length_secs: Some(60),
        },
    )]);

    let rows = list_in(&videos, None, &links).unwrap().videos;
    let slugs: Vec<&str> = rows.iter().map(|r| r.slug.as_str()).collect();
    assert_eq!(slugs, ["new-one", "old-one"]);
    assert_eq!(rows[0].title, "New one");
    assert_eq!(rows[0].thread_id, None);
    assert_eq!(rows[1].thread_id, Some(7));
    assert_eq!(rows[0].dir, new.to_string_lossy());

    let json = serde_json::to_value(&rows[1]).unwrap();
    assert_eq!(json["threadId"], 7);
    assert!(json["subject"].is_null() && json["problem"].is_null());
    assert_eq!(json["scenes"], 1);
}

#[test]
fn series_parts_have_a_video_when_the_folder_exists_and_keep_their_place_after_deletion() {
    use crate::studio::series::{self, Outline, Part};
    use crate::studio::videos::{create_in, NewVideo};
    let root = Scratch::new("series-rows");
    let videos = root.join("videos");
    let slug = "motion";
    series::create(
        &videos,
        slug,
        &Outline {
            title: "Motion".into(),
            subject: Some("PHYS".into()),
            theme: "default".into(),
            parts: vec![Part {
                slug: slug.into(),
                title: "Position".into(),
                question: "Where is it?".into(),
            }],
        },
    )
    .unwrap();
    let list =
        || serde_json::to_value(list_in(&videos, Some("PHYS"), &HashMap::new()).unwrap()).unwrap();
    let part = || list()["series"][0]["parts"][0].clone();
    assert!(list()["videos"].as_array().unwrap().is_empty());
    assert_eq!(part()["exists"], false);
    let dir = create_in(&videos, &NewVideo::from_part(&videos, slug, slug).unwrap()).unwrap();
    std::fs::create_dir(dir.join("renders")).unwrap();
    std::fs::write(dir.join("renders/draft.vtt"), b"captions").unwrap();
    let unmade = part();
    assert_eq!(unmade["exists"], true);
    assert_eq!(unmade["made"], false);
    assert_eq!(unmade["video"], list()["videos"][0]);
    std::fs::write(dir.join("renders/draft.mp4"), b"render").unwrap();
    let made = part();
    assert_eq!(made["made"], true);
    assert_eq!(made["video"], list()["videos"][0]);
    assert_eq!(made["video"]["series"], slug);
    assert_eq!(made["video"]["part"], 1);
    assert_eq!(made["video"]["title"], "Position");
    assert!(list_in(&videos, Some("OTHER"), &HashMap::new())
        .unwrap()
        .series
        .is_empty());
    delete::video_in(&videos, slug, &|path| {
        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
    })
    .unwrap();
    assert!(!dir.exists());
    let deleted = part();
    assert_eq!(deleted["number"], 1);
    assert_eq!(deleted["slug"], slug);
    assert_eq!(deleted["made"], false);
    assert!(deleted["video"].is_null());
    scaffold(&videos, slug, "Unrelated");
    assert!(!series::show(&videos, slug).unwrap().parts[0].exists);
    assert!(part()["video"].is_null());
    let path = videos.join(slug).join("video.json");
    let mut other: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    other["series"] = "another-series".into();
    std::fs::write(path, other.to_string()).unwrap();
    assert!(part()["video"].is_null());
    assert_eq!(part()["exists"], false);
    assert_eq!(part()["made"], false);
}

#[test]
fn the_detail_of_a_narrated_video_has_scene_times_and_words() {
    let root = Scratch::new("cmd-detail");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    std::fs::create_dir_all(dir.join("renders")).unwrap();
    std::fs::write(dir.join("renders/draft.mp4"), "x").unwrap();
    std::fs::write(dir.join("renders/small.mp4"), "x").unwrap();
    std::fs::write(dir.join("renders/notes.txt"), "x").unwrap();
    std::fs::write(dir.join("narration/fixture-intro.wav"), "x").unwrap();

    let detail = detail_in(
        &videos,
        &Library::default(),
        &HashMap::new(),
        &VoiceSettings {
            engine: Some(Engine::Kokoro),
            voice: Some("settings".into()),
            ..VoiceSettings::default()
        },
        "narrated",
    )
    .unwrap();
    assert_eq!((detail.width, detail.height, detail.fps), (640, 360, 30));
    assert_eq!(detail.theme, "default");
    assert_eq!(
        detail.voice.as_deref(),
        Some("af_heart"),
        "video.json's voice wins"
    );
    assert!(detail.row.narrated);
    assert_eq!(detail.scenes.len(), 2);
    let intro = &detail.scenes[0];
    assert_eq!(intro.id.as_deref(), Some("intro"));
    assert_eq!(intro.component, "Cued");
    assert!(intro.built, "the video's own component resolves");
    assert_eq!(intro.start, Some(0.0));
    assert!(intro.duration.unwrap() >= 3.0, "{:?}", intro.duration);
    assert_eq!(
        intro.text.as_deref(),
        Some("We follow the gradient downhill, one small step at a time.")
    );
    let outro = &detail.scenes[1];
    assert_eq!(outro.start, intro.duration);
    assert_eq!(outro.duration, Some(1.5));
    assert_eq!(outro.text, None, "a silent scene has no words");
    assert_eq!(
        intro.audio.as_deref(),
        Some(&*dir.join("narration/fixture-intro.wav").to_string_lossy())
    );
    assert_eq!(outro.audio, None, "a silent scene has no clip");
    assert_eq!(detail.renders.len(), 2, "{:?}", detail.renders);
    assert_eq!(
        detail.renders[0].path,
        dir.join("renders").join("draft.mp4").to_string_lossy()
    );
    assert!(detail.renders[0].modified > 0);
    assert_eq!(detail.timing_problem, None);
    assert!(detail.script_modified.is_some() && detail.narration_modified.is_some());

    let json = serde_json::to_value(&detail).unwrap();
    assert_eq!(json["renders"][0]["preset"], "draft");
    assert_eq!(json["renders"][1]["preset"], "small");
    assert_eq!(json["renders"][0]["captions"], false);
    assert_eq!(json["captions"], false);
    assert_eq!(json["scenes"][1]["duration"], 1.5);
    assert_eq!(json["row"]["slug"], "narrated");
    assert!(json["timingProblem"].is_null());
    assert!(json["scenes"][0]["built"].as_bool().unwrap());
    assert!(json["scenes"][1]["audio"].is_null());

    let unconfigured = detail_in(
        &videos,
        &Library::default(),
        &HashMap::new(),
        &VoiceSettings::default(),
        "narrated",
    )
    .unwrap();
    assert_eq!(
        unconfigured.voice, None,
        "the voice needs a resolved engine"
    );
}

#[test]
fn the_detail_of_an_unnarrated_video_has_no_times_and_falls_back_to_the_settings_voice() {
    let root = Scratch::new("cmd-detail-stale");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    // The words changed after narrating: the clip is for older text.
    std::fs::write(dir.join("script.md"), "## intro\n\nA different sentence.\n").unwrap();
    let mut video: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("video.json")).unwrap()).unwrap();
    video.as_object_mut().unwrap().remove("voice");
    std::fs::write(dir.join("video.json"), video.to_string()).unwrap();

    let detail = detail_in(
        &videos,
        &Library::default(),
        &HashMap::new(),
        &VoiceSettings {
            engine: Some(Engine::Kokoro),
            voice: Some("settings".into()),
            ..VoiceSettings::default()
        },
        "narrated",
    )
    .unwrap();
    assert_eq!(detail.voice.as_deref(), Some("settings"));
    assert!(
        detail.timing_problem.is_some(),
        "a stale narration says why the scenes have no times"
    );
    assert!(detail
        .scenes
        .iter()
        .all(|s| s.start.is_none() && s.duration.is_none()));
    assert_eq!(
        detail.scenes[0].text.as_deref(),
        Some("A different sentence.")
    );
    assert!(
        detail.scenes.iter().all(|s| s.audio.is_none()),
        "a clip for older text is not the scene's"
    );
    assert!(detail.renders.is_empty());

    let none = detail_in(
        &videos,
        &Library::default(),
        &HashMap::new(),
        &VoiceSettings::default(),
        "narrated",
    )
    .unwrap();
    assert_eq!(none.voice, None);
    assert!(detail_in(
        &videos,
        &Library::default(),
        &HashMap::new(),
        &VoiceSettings::default(),
        "../x"
    )
    .is_err());
}

#[test]
fn a_frame_is_a_png_of_the_width_asked_and_stale_narration_is_its_own_error() {
    let root = Scratch::new("cmd-frame");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    let library = Library::default();

    let at = FrameAt::Scene { scene: 0, t: 1.0 };
    let bytes = frame_png(&videos, &library, "narrated", at, 320).unwrap();
    assert_eq!(png_size(&bytes), (320, 180));
    let global = frame_png(
        &videos,
        &library,
        "narrated",
        FrameAt::Global { global: 4.0 },
        640,
    )
    .unwrap();
    assert_eq!(png_size(&global), (640, 360));

    for width in [0, MAX_WIDTH + 1] {
        assert!(frame_png(&videos, &library, "narrated", at, width).is_err());
    }
    let err = frame_png(
        &videos,
        &library,
        "narrated",
        FrameAt::Global { global: 99.0 },
        320,
    )
    .unwrap_err();
    assert!(err.contains("99"), "{err}");

    std::fs::write(dir.join("script.md"), "## intro\n\nA different sentence.\n").unwrap();
    let err = frame_png(&videos, &library, "narrated", at, 320).unwrap_err();
    assert!(err.contains("narrat"), "stale narration says so: {err}");
}

#[test]
fn a_frame_position_reads_from_the_pages_json() {
    let scene: FrameAt = serde_json::from_str(r#"{"scene":2,"t":1.5}"#).unwrap();
    assert_eq!(scene, FrameAt::Scene { scene: 2, t: 1.5 });
    let global: FrameAt = serde_json::from_str(r#"{"global":12.25}"#).unwrap();
    assert_eq!(global, FrameAt::Global { global: 12.25 });
}

fn thumbs(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir.join(".cache/thumbs"))
        .map(|rd| {
            rd.flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

#[test]
fn a_thumbnail_is_cached_by_its_scene_and_replaced_when_the_scene_changes() {
    let root = Scratch::new("cmd-thumb");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    let library = Library::default();

    let first = thumbnail_in(&videos, &library, "narrated").unwrap();
    assert_eq!(png_size(&first), (640, 360));
    let names = thumbs(&dir);
    assert_eq!(names.len(), 1, "{names:?}");

    // A hit reads the file: an altered cache file comes back as it is.
    let file = dir.join(".cache/thumbs").join(&names[0]);
    std::fs::write(&file, &first[..first.len() - 1]).unwrap();
    let hit = thumbnail_in(&videos, &library, "narrated").unwrap();
    assert_eq!(hit.len(), first.len() - 1);
    assert_eq!(thumbs(&dir), names);

    // Editing scene 0's props is a new key: one fresh file, the old one gone.
    let mut video: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("video.json")).unwrap()).unwrap();
    video["scenes"][0]["props"]["title"] = "Another title".into();
    std::fs::write(dir.join("video.json"), video.to_string()).unwrap();
    let second = thumbnail_in(&videos, &library, "narrated").unwrap();
    assert_ne!(second, first);
    let after = thumbs(&dir);
    assert_eq!(after.len(), 1);
    assert_ne!(after, names);
    assert!(!dir.join("renders").exists(), "renders/ is never touched");
}

#[test]
fn an_unnarrated_video_gets_a_silent_thumbnail_and_a_failure_says_so() {
    let root = Scratch::new("cmd-thumb-silent");
    let videos = root.join("videos");
    let library = libraries_at(&root.join("library"), &root.join("subjects"), false).unwrap();

    // The scaffold has a hold and no narration at all.
    let made = scaffold(&videos, "fresh", "Fresh");
    let bytes = thumbnail_in(&videos, &library, "fresh").unwrap();
    assert_eq!(png_size(&bytes), (640, 360));
    assert_eq!(thumbs(&made).len(), 1);

    // Stale narration, and a first scene that cues a word: silent, it has
    // no words to cue, and the thumbnail says why.
    let dir = narrated(&videos);
    std::fs::write(dir.join("script.md"), "## intro\n\nA different sentence.\n").unwrap();
    let err = thumbnail_in(&videos, &Library::default(), "narrated").unwrap_err();
    assert!(err.starts_with("no thumbnail for `narrated`:"), "{err}");
    assert!(err.contains("not narrated"), "{err}");

    // The same video with a first scene that needs no words draws silent.
    let mut video: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(dir.join("video.json")).unwrap()).unwrap();
    video["scenes"][0] = serde_json::json!({ "id": "intro", "component": "Outro", "hold": 1.0 });
    std::fs::write(dir.join("video.json"), video.to_string()).unwrap();
    let bytes = thumbnail_in(&videos, &Library::default(), "narrated").unwrap();
    assert_eq!(png_size(&bytes), (640, 360));

    // A component that does not draw fails, naming the video.
    std::fs::write(
        dir.join("components/Outro.tsx"),
        "export default function Outro( {",
    )
    .unwrap();
    let err = thumbnail_in(&videos, &Library::default(), "narrated").unwrap_err();
    assert!(err.starts_with("no thumbnail for `narrated`:"), "{err}");
}

#[test]
fn list_lengths_match_detail_without_reading_components_and_reject_stale_narration() {
    let root = Scratch::new("list-seconds");
    let videos = root.join("videos");
    let dir = narrated(&videos);
    let library = libraries_at(&root.join("library"), &root.join("subjects"), false).unwrap();
    let theme_path = root.join("library/themes/default.json");
    let mut theme: serde_json::Value =
        serde_json::from_str(studio_core::Theme::bundled_text("default").unwrap()).unwrap();
    theme["narration"]["lead"] = 0.73.into();
    theme["narration"]["tail"] = 1.17.into();
    std::fs::write(theme_path, theme.to_string()).unwrap();
    let length = || {
        list_in(&videos, None, &HashMap::new())
            .unwrap()
            .videos
            .into_iter()
            .find(|v| v.slug == "narrated")
            .unwrap()
            .seconds
    };
    let detail = detail_in(
        &videos,
        &library,
        &HashMap::new(),
        &VoiceSettings::default(),
        "narrated",
    )
    .unwrap();
    let last = detail.scenes.last().unwrap();
    assert_eq!(length(), Some(last.start.unwrap() + last.duration.unwrap()));
    assert_eq!(length(), detail.row.seconds);
    std::fs::remove_dir_all(dir.join("components")).unwrap();
    std::fs::write(dir.join("components"), "not a directory").unwrap();
    assert_eq!(length(), detail.row.seconds);
    std::fs::write(dir.join("script.md"), "## intro\n\nChanged words.\n").unwrap();
    assert_eq!(length(), None);
    std::fs::remove_file(dir.join("narration/manifest.json")).unwrap();
    assert_eq!(length(), None);
    std::fs::write(dir.join("video.json"), "unfinished JSON").unwrap();
    assert_eq!(length(), None);

    scaffold(&videos, "silent", "Silent");
    let detail = detail_in(
        &videos,
        &library,
        &HashMap::new(),
        &VoiceSettings::default(),
        "silent",
    )
    .unwrap();
    let row = list_in(&videos, None, &HashMap::new())
        .unwrap()
        .videos
        .into_iter()
        .find(|v| v.slug == "silent")
        .unwrap();
    assert!(row.seconds.is_some());
    assert_eq!(row.seconds, detail.row.seconds);
}

#[test]
fn a_series_part_carries_its_own_link_and_the_series_the_newest_outline_or_part_time() {
    use crate::studio::series::{self, Outline, Part};
    use crate::studio::videos::{create_in, NewVideo};
    let root = Scratch::new("series-link-time");
    let videos = root.join("videos");
    series::create(
        &videos,
        "motion",
        &Outline {
            title: "Motion".into(),
            subject: None,
            theme: "default".into(),
            parts: ["position", "speed", "force"]
                .into_iter()
                .map(|slug| Part {
                    slug: slug.into(),
                    title: slug.into(),
                    question: "Why?".into(),
                })
                .collect(),
        },
    )
    .unwrap();
    for slug in ["position", "speed", "force"] {
        create_in(
            &videos,
            &NewVideo::from_part(&videos, "motion", slug).unwrap(),
        )
        .unwrap();
    }
    let mut links = HashMap::from([
        (
            "position".into(),
            StudioLink {
                slug: "position".into(),
                thread_id: None,
                length_secs: None,
            },
        ),
        (
            "speed".into(),
            StudioLink {
                slug: "speed".into(),
                thread_id: Some(7),
                length_secs: None,
            },
        ),
        (
            "force".into(),
            StudioLink {
                slug: "force".into(),
                thread_id: Some(8),
                length_secs: None,
            },
        ),
    ]);
    let list = list_in(&videos, None, &links).unwrap();
    let threads: Vec<_> = list.series[0]
        .outline
        .parts
        .iter()
        .map(|p| p.video.as_ref().and_then(|v| v.thread_id))
        .collect();
    assert_eq!(threads, [None, Some(7), Some(8)]);
    let own = root.join("series/motion/series.json");
    let newest = std::time::SystemTime::now() + std::time::Duration::from_secs(60);
    std::fs::File::options()
        .write(true)
        .open(&own)
        .unwrap()
        .set_modified(newest)
        .unwrap();
    let stamp = newest
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    assert_eq!(
        list_in(&videos, None, &links).unwrap().series[0].modified,
        Some(stamp)
    );
    std::fs::File::options()
        .write(true)
        .open(videos.join("force/video.json"))
        .unwrap()
        .set_modified(newest + std::time::Duration::from_secs(60))
        .unwrap();
    let json = serde_json::to_value(list_in(&videos, None, &links).unwrap()).unwrap();
    assert_eq!(json["series"][0]["modified"], stamp + 60);
    assert!(json["series"][0].get("threadId").is_none());
    assert_eq!(json["series"][0]["parts"][1]["video"]["threadId"], 7);
    links.remove("speed");
    let json = serde_json::to_value(list_in(&videos, None, &links).unwrap()).unwrap();
    assert!(json["series"][0]["parts"][1]["video"]["threadId"].is_null());
}

#[test]
fn app_video_claims_exclude_rendering_narration_and_edits() {
    use super::actions::{edit, start_narration, start_render};
    use crate::studio::narrate::running::NARRATIONS;
    use crate::studio::render::{Preset, RENDERS};
    use std::sync::atomic::Ordering;

    let dir = Scratch::new("video-action-claims");

    let render = start_render(&dir, Preset::Final).unwrap();
    assert!(matches!(start_narration(&dir), Err(error) if error.contains("final render")));
    assert!(!NARRATIONS.running(&dir));
    assert!(edit(&dir, || panic!("edit while rendering"))
        .unwrap_err()
        .contains("final render"));
    drop(render);

    let narration = start_narration(&dir).unwrap();
    assert!(start_narration(&dir).is_err());
    let message = "this video is being narrated; wait for it or cancel it";
    assert!(matches!(start_render(&dir, Preset::Draft), Err(error) if error == message));
    assert_eq!(RENDERS.running(&dir), None);
    assert_eq!(
        edit(&dir, || panic!("edit while narrating")).unwrap_err(),
        message
    );
    assert!(NARRATIONS.cancel(&dir));
    assert!(narration.cancel_flag().load(Ordering::Relaxed));
    drop(narration);

    assert!(!NARRATIONS.cancel(&dir));
    edit(&dir, || Ok(())).unwrap();
    assert!(start_render(&dir, Preset::Draft).is_ok());
}

#[test]
fn narration_progress_uses_the_video_rows_folder_and_the_ipc_shapes() {
    use super::narration::{Event, NarrateSummary, Step};
    use crate::studio::narrate::Outcome;
    use serde_json::json;

    let root = Scratch::new("video-narration-events");
    let videos = root.join("videos");
    let dir = scaffold(&videos, "demo", "Demo");
    let rows = list_in(&videos, None, &HashMap::new()).unwrap();
    assert_eq!(rows.videos[0].dir, dir.to_string_lossy());
    assert_eq!(
        rows.videos[0].dir,
        crate::studio::videos::video_in(&videos, "demo")
            .unwrap()
            .to_string_lossy()
    );
    let dir = rows.videos[0].dir.as_str();
    let event = |step| serde_json::to_value(Event { dir, step }).unwrap();

    assert_eq!(
        event(Step::Scene {
            id: "intro",
            n: 1,
            of: 12
        }),
        json!({ "dir": dir, "phase": "scene", "id": "intro", "n": 1, "of": 12 })
    );
    for (outcome, name) in [(Outcome::Narrated, "narrated"), (Outcome::Cached, "cached")] {
        assert_eq!(
            event(Step::Done {
                id: "intro",
                n: 1,
                of: 12,
                outcome
            }),
            json!({ "dir": dir, "phase": "done", "id": "intro", "n": 1, "of": 12, "outcome": name })
        );
    }
    assert_eq!(
        event(Step::Complete {
            scenes: 12,
            narrated: 5
        }),
        json!({ "dir": dir, "phase": "complete", "scenes": 12, "narrated": 5 })
    );
    assert_eq!(
        event(Step::Cancelled),
        json!({ "dir": dir, "phase": "cancelled" })
    );
    assert_eq!(
        event(Step::Error {
            error: "scene `intro`: a failure"
        }),
        json!({ "dir": dir, "phase": "error", "error": "scene `intro`: a failure" })
    );
    assert_eq!(
        serde_json::to_value(NarrateSummary {
            scenes: 12,
            narrated: 5,
            ms: 123
        })
        .unwrap(),
        json!({ "scenes": 12, "narrated": 5, "ms": 123 })
    );
}
