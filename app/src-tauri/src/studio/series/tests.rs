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
