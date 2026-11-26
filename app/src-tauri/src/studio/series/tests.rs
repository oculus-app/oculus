use super::*;
use crate::studio::videos::{create_in, NewVideo};
use crate::test_support::Scratch;

fn outline() -> Outline {
    Outline {
        title: "Lines".into(),
        subject: Some("MATH".into()),
        theme: "default".into(),
        parts: vec![Part {
            slug: "slope".into(),
            title: "Slope".into(),
            question: "How steep?".into(),
        }],
    }
}

#[test]
fn lint_checks_the_outline_and_its_membership() {
    let root = Scratch::new("series-lint");
    let videos = root.join("videos");
    create(&videos, "lines", &outline()).unwrap();
    let new = NewVideo::from_part(&videos, "lines", "slope").unwrap();
    let dir = create_in(&videos, &new).unwrap();
    let project = studio_core::Project::load(&dir).unwrap();
    assert!(lint(&project, &videos).is_none());
    let mut empty = outline();
    empty.parts.clear();
    let path = path(&videos, "lines").unwrap();
    atomic_write::json(&path, &empty).unwrap();
    let issue = lint(&project, &videos).unwrap();
    assert_eq!(issue.level, studio_core::LintLevel::Error);
    assert!(issue.error.to_string().contains("series add lines"));
    fs::remove_file(path).unwrap();
    let issue = lint(&project, &videos).unwrap();
    assert_eq!(issue.level, studio_core::LintLevel::Error);
    assert!(issue.error.to_string().contains("series.json"));
}

#[test]
fn invalid_edits_preserve_the_outline_and_concurrent_adds_both_survive() {
    let root = Scratch::new("series-add");
    let videos = root.join("videos");
    let orig = outline();
    assert!(create(&videos, "../outside", &orig).is_err());
    create(&videos, "lines", &orig).unwrap();
    assert!(create(&videos, "lines", &orig).is_err());
    let original = fs::read(path(&videos, "lines").unwrap()).unwrap();
    let part = &orig.parts[0];
    assert!(add(&videos, "lines", part.clone(), None).is_err());
    assert!(add(&videos, "lines", part.clone(), Some(0)).is_err());
    assert!(add(&videos, "lines", part.clone(), Some(3)).is_err());
    assert_eq!(fs::read(path(&videos, "lines").unwrap()).unwrap(), original);
    std::thread::scope(|scope| {
        for slug in ["rise", "run"] {
            let part = Part {
                slug: slug.to_owned(),
                ..part.clone()
            };
            let videos = &videos;
            scope.spawn(move || add(videos, "lines", part, None).unwrap());
        }
    });
    let outline = read(&videos, "lines").unwrap();
    assert_eq!(outline.parts.len(), 3);
    for slug in ["rise", "run"] {
        assert!(outline.entry("lines", slug).is_ok());
    }
}

fn three_parts(videos: &Path) {
    create(videos, "lines", &outline()).unwrap();
    for (slug, title) in [("rise", "Rise"), ("run", "Run")] {
        let part = Part {
            slug: slug.into(),
            title: title.into(),
            question: format!("What is the {slug}?"),
        };
        add(videos, "lines", part, None).unwrap();
    }
}

fn scaffold(videos: &Path, slug: &str, script: &str, render: bool) {
    let dir = create_in(videos, &NewVideo::from_part(videos, "lines", slug).unwrap()).unwrap();
    fs::write(dir.join("script.md"), script).unwrap();
    if render {
        fs::create_dir_all(dir.join("renders")).unwrap();
        fs::write(dir.join("renders/draft.mp4"), b"").unwrap();
    }
}

#[test]
fn recap_of_the_first_part_has_nothing_before() {
    let root = Scratch::new("series-recap-first");
    let videos = root.join("videos");
    three_parts(&videos);
    let recap = recap(&videos, "lines", "1").unwrap();
    assert_eq!(recap.part.part.slug, "slope");
    assert!(recap.before.is_none());
    assert_eq!(recap, super::recap(&videos, "lines", "slope").unwrap());
    let text = recap.text();
    assert!(text.starts_with("Lines (lines)\nsubject MATH, theme default\n"));
    assert!(text.contains("3. Run (run) — What is the run? [not made]"));
    assert!(text.contains("This part: 1. Slope (slope) — How steep? [not made]"));
    assert!(text.ends_with("The part before: none, this is the first part.\n"));
    let json = serde_json::to_value(&recap).unwrap();
    assert_eq!(json["slug"], "lines");
    assert_eq!(json["parts"].as_array().unwrap().len(), 3);
    assert_eq!(json["part"]["number"], 1);
    assert!(json["before"].is_null());
}

#[test]
fn recap_prints_the_made_part_befores_script_only() {
    let root = Scratch::new("series-recap-made");
    let videos = root.join("videos");
    three_parts(&videos);
    let script = "## hook\n\nA line climbs two for every one across.\n";
    scaffold(&videos, "slope", script, true);
    let recap = recap(&videos, "lines", "rise").unwrap();
    assert_eq!(recap.part.number, 2);
    let before = recap.before.as_ref().unwrap();
    assert_eq!(before.part.part.slug, "slope");
    assert!(before.part.made);
    assert_eq!(before.script.as_deref(), Some(script));
    let text = recap.text();
    assert!(text.contains("1. Slope (slope) — How steep? [made]"));
    assert!(text.contains("This part: 2. Rise (rise) — What is the rise? [not made]"));
    assert!(text.ends_with(&format!(
        "The part before: 1. Slope (slope). Its script:\n\n{script}"
    )));
    assert!(!text.contains("TitleCard"));
    let json = serde_json::to_value(&recap).unwrap();
    assert_eq!(json["before"]["slug"], "slope");
    assert_eq!(json["before"]["made"], true);
    assert_eq!(json["before"]["script"], script);
}

#[test]
fn recap_says_the_part_before_is_not_made_yet() {
    let root = Scratch::new("series-recap-unmade");
    let videos = root.join("videos");
    three_parts(&videos);
    // A script with no render is a part still being made.
    scaffold(&videos, "slope", "## hook\n\nHalf written.\n", false);
    // A render beside a blank script is made, with nothing to recap.
    scaffold(&videos, "rise", "\n", true);
    let second = recap(&videos, "lines", "2").unwrap();
    assert!(second.before.as_ref().unwrap().script.is_none());
    assert!(second
        .text()
        .ends_with("The part before: 1. Slope (slope), not made yet.\n"));
    let third = recap(&videos, "lines", "run").unwrap();
    let before = third.before.as_ref().unwrap();
    assert!(before.part.made);
    assert!(before.script.is_none());
    assert!(third
        .text()
        .ends_with("The part before: 2. Rise (rise), made with an empty script.\n"));
    let json = serde_json::to_value(&third).unwrap();
    assert!(json["before"]["script"].is_null());
}

#[test]
fn recap_names_the_unknown_series_or_part() {
    let root = Scratch::new("series-recap-unknown");
    let videos = root.join("videos");
    three_parts(&videos);
    let err = recap(&videos, "lines", "4").unwrap_err();
    assert!(
        err.contains("no part 4") && err.contains("3 parts"),
        "{err}"
    );
    let err = recap(&videos, "lines", "0").unwrap_err();
    assert!(err.contains("no part 0"), "{err}");
    let err = recap(&videos, "lines", "curves").unwrap_err();
    assert!(err.contains("no part `curves`"), "{err}");
    let err = recap(&videos, "circles", "1").unwrap_err();
    assert!(err.contains("no series `circles`"), "{err}");
}
