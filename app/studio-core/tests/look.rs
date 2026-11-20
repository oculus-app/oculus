//! What a scene shows over time: lint's slide-look errors (small text,
//! sparse, scene title), its warnings (off-frame, still, fragment), their
//! levels, the length errors, `lint_scene`, and `beats`.
#![allow(clippy::unwrap_used, clippy::panic)] // helpers outside #[test] fns

mod common;

use common::fixture;
use serde_json::{Value, json};
use std::path::PathBuf;
use studio_core::{LintIssue, LintLevel, Project};

/// A project folder in the temp dir, 800x400, removed on drop.
struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Temp {
        let dir = std::env::temp_dir().join(format!("studio-look-{name}-{}", std::process::id()));
        std::fs::remove_dir_all(&dir).ok();
        std::fs::create_dir_all(dir.join("components")).unwrap();
        std::fs::create_dir_all(dir.join("narration")).unwrap();
        Temp(dir)
    }

    fn file(&self, rel: &str, content: &str) -> &Temp {
        std::fs::write(self.0.join(rel), content).unwrap();
        self
    }

    fn video(&self, scenes: Value) -> &Temp {
        self.sized(800, 400, scenes)
    }

    fn sized(&self, width: u32, height: u32, scenes: Value) -> &Temp {
        let video = json!({ "size": { "width": width, "height": height }, "theme": "default", "scenes": scenes });
        self.file("video.json", &video.to_string())
    }

    /// One component `A` returning `body` (JSX, `t` in scope) in a scene.
    fn scene(&self, body: &str, scene: Value) -> Project {
        self.file(
            "components/A.tsx",
            &format!("export const props = {{}};\nexport default ({{}}, {{ t }}) =>\n  {body};\n"),
        )
        .video(json!([scene]));
        Project::load(&self.0).unwrap()
    }

    /// Scene `a` narrated with `text`, one word a second from 0.
    fn narrate(&self, text: &str) -> &Temp {
        self.narrate_all(&[("a", text)])
    }

    /// Each scene id narrated with its text, one word a second from 0.
    fn narrate_all(&self, scenes: &[(&str, &str)]) -> &Temp {
        let mut script = String::new();
        let mut manifest = serde_json::Map::new();
        for (id, text) in scenes {
            let words: Vec<Value> = text
                .split(' ')
                .enumerate()
                .map(|(i, w)| {
                    let s = i as f64;
                    json!({ "text": w, "start": s, "end": s + 0.8, "confidence": -0.5 })
                })
                .collect();
            let n = words.len() as f64;
            script.push_str(&format!("## {id}\n{text}\n\n"));
            manifest.insert(
                (*id).to_owned(),
                json!({ "key": format!("k-{id}"), "text": text, "audio": "k.wav", "duration": n, "words": words }),
            );
        }
        self.file("script.md", &script);
        self.file(
            "narration/manifest.json",
            &json!({ "version": 1, "scenes": manifest }).to_string(),
        )
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).ok();
    }
}

fn warnings(p: &Project) -> Vec<(&'static str, String)> {
    let look = p.look(&[0]).pop().unwrap().unwrap();
    look.warnings()
        .into_iter()
        .map(|w| (w.kind, w.message))
        .collect()
}

fn kinds(p: &Project) -> Vec<&'static str> {
    warnings(p).into_iter().map(|(k, _)| k).collect()
}

/// An absolutely placed box, `left` and `top` in px.
fn boxed(key: &str, left: &str, top: &str, size: u32) -> String {
    format!(
        "<Box key=\"{key}\" style={{{{ position: \"absolute\", left: {left}, top: {top}, width: {size}, height: {size}, fill: \"#5e6ad2\" }}}} />"
    )
}

/// Boxes spread corner to corner, so only the check under test fires.
fn spread(extra: &str) -> String {
    format!(
        "<Box style={{{{ flexGrow: 1 }}}}>{}{}{extra}</Box>",
        boxed("l", "40", "40", 100),
        boxed("r", "660", "260", 100)
    )
}

/// `n` words of letters, `wa wb …`, since script.md takes no digits.
fn words(n: usize) -> String {
    let letter = |i: usize| char::from(b'a' + (i % 26) as u8);
    (0..n)
        .map(|i| match i / 26 {
            0 => format!("w{}", letter(i)),
            k => format!("w{}{}", letter(i), letter(k)),
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// A Text placed at `left`, `top` in `size` px.
fn text(key: &str, left: u32, top: u32, size: u32, body: &str) -> String {
    format!(
        "<Text key=\"{key}\" style={{{{ position: \"absolute\", left: {left}, top: {top}, fontSize: {size} }}}}>{body}</Text>"
    )
}

/// The errors of a lint other than the component-source rules.
fn errors(p: &Project) -> Vec<(&'static str, String)> {
    let report = p.lint().unwrap();
    report
        .issues
        .iter()
        .filter(|i| i.level == LintLevel::Error && !common::component_rule(&i.to_string()))
        .map(|i| (i.error.kind(), i.to_string()))
        .collect()
}

#[test]
fn a_node_left_past_the_edge_is_off_frame_but_one_sliding_in_is_not() {
    let t = Temp::new("off");
    let past = boxed("label", "750", "40", 100);
    let p = t.scene(&spread(&past), json!({ "component": "A", "hold": 2 }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert_eq!(w[0].0, "off_frame");
    assert!(
        w[0].1
            .starts_with("`label` is 50 px past the right edge from 0.0 s to 2.0 s"),
        "{}",
        w[0].1
    );
    // Moving every sample through the edge: never settled.
    let sliding = boxed("slide", "-100 + t * 300", "40", 100);
    let p = t.scene(&spread(&sliding), json!({ "component": "A", "hold": 2 }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
}

#[test]
fn a_camera_zoom_crops_on_purpose() {
    let p = Project::load(fixture("camera")).unwrap();
    assert!(!kinds(&p).contains(&"off_frame"), "{:?}", warnings(&p));
}

#[test]
fn a_six_second_hold_under_narration_is_fine_and_nine_is_still() {
    let t = Temp::new("still");
    t.narrate(&words(6));
    let p = t.scene(&spread(""), json!({ "id": "a", "component": "A" }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
    t.narrate(&words(9));
    let p = t.scene(&spread(""), json!({ "id": "a", "component": "A" }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert_eq!(w[0].0, "still");
    assert!(
        w[0].1.starts_with("nothing on screen changes from 0.2 s to 9.2 s while the narration says \"wa wb wc wd we wf wg wh wi\""),
        "{}",
        w[0].1
    );
    // A box that moves the whole time is never still.
    let p = t.scene(
        &spread(&boxed("m", "300", "40 + t * 20", 50)),
        json!({ "id": "a", "component": "A" }),
    );
    assert_eq!(kinds(&p), Vec::<&str>::new());
}

#[test]
fn an_empty_opening_is_still() {
    let t = Temp::new("opening");
    let late = "<Box style={{ flexGrow: 1, opacity: t > 1.5 ? 1 : 0 }}>{SPREAD}</Box>";
    let p = t.scene(
        &late.replace("{SPREAD}", &spread("")),
        json!({ "component": "A", "hold": 3 }),
    );
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert!(
        w[0].1.starts_with("nothing is on screen until 1.6 s"),
        "{}",
        w[0].1
    );
}

#[test]
fn content_in_a_small_part_of_the_frame_is_sparse() {
    let t = Temp::new("sparse");
    let left = format!(
        "<Box style={{{{ flexGrow: 1 }}}}>{}{}</Box>",
        boxed("a", "40", "50", 100),
        boxed("b", "200", "200", 100)
    );
    let p = t.scene(&left, json!({ "component": "A", "hold": 4 }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert_eq!(w[0].0, "sparse");
    assert!(
        w[0].1.starts_with("everything on screen fits in at most 32% of the frame's width and 62% of its height from 0.0 s to 4.0 s; fill at least 60% of the width and 50% of the height"),
        "{}",
        w[0].1
    );
    // The same for under 3 s is fine.
    let p = t.scene(&left, json!({ "component": "A", "hold": 2.5 }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
    // A thin stroke across the frame is content: the box, not the ink.
    let rule = "<Box style={{ position: \"absolute\", left: 40, top: 20, width: 720, height: 360, border: { width: 1, color: \"#5e6ad2\" } }} />";
    let framed = format!("<Box style={{{{ flexGrow: 1 }}}}>{left}{rule}</Box>");
    let p = t.scene(&framed, json!({ "component": "A", "hold": 4 }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
}

#[test]
fn text_too_small_for_the_chat_player_is_small_text() {
    // 800x400: the floor is 400 / 27 = 14.8 px.
    let t = Temp::new("small");
    let small = text("note", 300, 180, 12, "a small note");
    let p = t.scene(&spread(&small), json!({ "component": "A", "hold": 2 }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert_eq!(w[0].0, "small_text");
    assert!(
        w[0].1.starts_with("`note` (\"a small note\") is set at 12 px, under 14.8 px (1/27 of the frame's 400 px side), for 2.0 s from 0.0 s to 2.0 s; the chat player is about 600 px wide, where it reads as 9 px"),
        "{}",
        w[0].1
    );
    // Shown for under a second, or scaled up past the floor, it passes.
    let brief = format!("{{t < 0.8 ? {small} : null}}");
    let p = t.scene(&spread(&brief), json!({ "component": "A", "hold": 2 }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
    let scaled = r#"<Box style={{ position: "absolute", left: 300, top: 180, scale: 1.5 }}><Text key="note" style={{ fontSize: 12 }}>a small note</Text></Box>"#;
    let p = t.scene(&spread(scaled), json!({ "component": "A", "hold": 2 }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
    // A Math is read by its fontSize too.
    let math = r#"<Box style={{ position: "absolute", left: 300, top: 180 }}><Math key="eq" tex="x + 1" style={{ fontSize: 10 }} /></Box>"#;
    let p = t.scene(&spread(math), json!({ "component": "A", "hold": 2 }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert!(w[0].1.starts_with("`eq` is set at 10 px"), "{}", w[0].1);
}

#[test]
fn a_text_held_at_the_top_is_a_scene_title_outside_a_title_card() {
    let t = Temp::new("title");
    let title = text("heading", 40, 10, 30, "The heading");
    let p = t.scene(&spread(&title), json!({ "component": "A", "hold": 4 }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert_eq!(w[0].0, "scene_title");
    assert!(
        w[0].1.starts_with("`heading` (\"The heading\") sits in the top 15% of the frame for 4.0 s of the scene's 4.0 s"),
        "{}",
        w[0].1
    );
    // Gone after the first second, it is a heading that hands over.
    let brief = format!("{{t < 1 ? {title} : null}}");
    let p = t.scene(&spread(&brief), json!({ "component": "A", "hold": 4 }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
    // A TitleCard is a title on purpose, and so is its whole frame.
    t.file(
        "components/TitleCard.tsx",
        &format!("export const props = {{}};\nexport default () => <Box style={{{{ flexGrow: 1 }}}}>{title}</Box>;\n"),
    )
    .video(json!([{ "component": "TitleCard", "hold": 4 }]));
    let p = Project::load(&t.0).unwrap();
    assert_eq!(kinds(&p), Vec::<&str>::new());
}

#[test]
fn a_math_left_with_a_piece_of_a_rewrite_is_a_fragment() {
    let t = Temp::new("fragment");
    let math = r#"<Write at={{ a: 0, b: 99 }}><Math key="eq" tex="\k{a}{=} \k{b}{1 + 2 + 3 + 4 + 5}" style={{ fontSize: 40 }} /></Write>"#;
    let placed =
        format!("<Box style={{{{ position: \"absolute\", left: 300, top: 150 }}}}>{math}</Box>");
    let p = t.scene(&spread(&placed), json!({ "component": "A", "hold": 2 }));
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert_eq!(w[0].0, "fragment");
    assert!(
        w[0].1
            .starts_with("`eq` ends showing 1 of its 10 pieces (`a`)"),
        "{}",
        w[0].1
    );
    // A tiny mark alone at the end.
    let p = t.scene(
        &spread(&boxed("dot", "400", "350", 4)),
        json!({ "component": "A", "hold": 2 }),
    );
    let w = warnings(&p);
    assert_eq!(w.len(), 1, "{w:?}");
    assert!(w[0].1.starts_with("`dot` is a 4x4 px mark"), "{}", w[0].1);
}

#[test]
fn warnings_do_not_fail_lint_and_print_with_their_level() {
    let t = Temp::new("levels");
    t.narrate(&words(9));
    let p = t.scene(&spread(""), json!({ "id": "a", "component": "A" }));
    let report = p.lint().unwrap();
    let errors = report
        .issues
        .iter()
        .filter(|i| i.level == LintLevel::Error && !common::component_rule(&i.to_string()));
    assert_eq!(errors.count(), 0, "{report}");
    let warning: &LintIssue = report
        .issues
        .iter()
        .find(|i| i.level == LintLevel::Warning)
        .unwrap();
    assert_eq!(warning.error.kind(), "still");
    assert_eq!(warning.group, Some(("still span", "0.2-9.2 s".to_owned())));
    assert!(
        warning
            .to_string()
            .starts_with("warning: scene 0 `a` (A): nothing on screen changes"),
        "{warning}"
    );
}

#[test]
fn the_slide_look_fails_lint() {
    let t = Temp::new("look-levels");
    let small = text("note", 300, 180, 12, "a small note");
    let p = t.scene(&spread(&small), json!({ "component": "A", "hold": 2 }));
    let e = errors(&p);
    assert_eq!(e.len(), 1, "{e:?}");
    assert_eq!(e[0].0, "small_text");
    assert!(e[0].1.starts_with("scene 0 (A): `note`"), "{}", e[0].1);
}

#[test]
fn a_long_scene_and_a_long_video_fail_lint_unless_marked_long() {
    let t = Temp::new("long");
    t.narrate(&words(31));
    let p = t.scene(&spread(""), json!({ "id": "a", "component": "A" }));
    let e = errors(&p);
    assert_eq!(e.len(), 1, "{e:?}");
    assert_eq!(e[0].0, "long_scene");
    assert!(
        e[0].1
            .starts_with("scene 0 `a` (A): the narration runs 31.0 s, over 30 s"),
        "{}",
        e[0].1
    );
    // Five short narrated scenes are a long video; `"long": true` allows it.
    let ids = ["a", "b", "c", "d", "e"];
    let short = words(5);
    let narrated: Vec<(&str, &str)> = ids.iter().map(|id| (*id, short.as_str())).collect();
    t.narrate_all(&narrated);
    let scenes: Vec<Value> = ids
        .iter()
        .map(|id| json!({ "id": id, "component": "A" }))
        .collect();
    t.video(json!(scenes));
    let p = Project::load(&t.0).unwrap();
    let e = errors(&p);
    assert_eq!(e.len(), 1, "{e:?}");
    assert_eq!(e[0].0, "long_video");
    assert!(
        e[0].1
            .starts_with("the video has 5 narrated scenes and runs 31.3 s, over 4 scenes or 150 s"),
        "{}",
        e[0].1
    );
    let video = json!({ "size": { "width": 800, "height": 400 }, "theme": "default", "long": true, "scenes": scenes });
    t.file("video.json", &video.to_string());
    let p = Project::load(&t.0).unwrap();
    assert_eq!(errors(&p), Vec::<(&str, String)>::new());
    // Over 150 s is long too, narrated or not.
    std::fs::remove_file(t.0.join("script.md")).unwrap();
    let p = t.scene(&spread(""), json!({ "component": "A", "hold": 151 }));
    assert_eq!(
        errors(&p).into_iter().map(|(k, _)| k).collect::<Vec<_>>(),
        ["long_video"]
    );
}

#[test]
fn one_large_centred_picture_with_48_px_labels_passes_the_slide_look() {
    let t = Temp::new("picture");
    t.narrate(&words(20));
    let picture = "<Box key=\"picture\" style={{ position: \"absolute\", left: 260, top: 140, width: 1400, height: 760, radius: 24, border: { width: 4, color: \"#5e6ad2\" } }} />";
    let labels = [
        text("in", 320, 470, 48, "input"),
        text("out", 1440, 470, 48, "output"),
        text("caption", 800, 920, 48, "one step at a time"),
    ]
    .concat();
    let moving = boxed("dot", "400 + t * 50", "500", 60);
    t.file(
        "components/A.tsx",
        &format!("export const props = {{}};\nexport default ({{}}, {{ t }}) =>\n  <Box style={{{{ flexGrow: 1 }}}}>{picture}{labels}{moving}</Box>;\n"),
    )
    .sized(1920, 1080, json!([{ "id": "a", "component": "A" }]));
    let p = Project::load(&t.0).unwrap();
    assert_eq!(errors(&p), Vec::<(&str, String)>::new());
    assert_eq!(kinds(&p), Vec::<&str>::new());
}

#[test]
fn a_scoped_lint_reports_only_its_scene_and_component() {
    let t = Temp::new("scope");
    t.file(
        "components/A.tsx",
        "export const props = {};\nexport default () => <Box style={{ flexGrow: 1 }}><Box style={{ width: 600, height: 300, fill: \"#5e6ad2\" }} /></Box>;\n",
    )
    .video(json!([
        { "id": "gone", "component": "Missing", "hold": 1 },
        { "id": "here", "component": "A", "hold": 1 }
    ]));
    let p = Project::load(&t.0).unwrap();
    let all = p.lint().unwrap();
    assert!(all.issues.iter().any(|i| i.scene == Some(0)), "{all}");
    let one = p.lint_scene(1).unwrap();
    let lines: Vec<String> = one
        .issues
        .iter()
        .map(ToString::to_string)
        .filter(|l| !common::component_rule(l))
        .collect();
    assert!(lines.is_empty(), "{lines:?}");
    let zero = p.lint_scene(0).unwrap();
    assert_eq!(zero.errors(), 1, "{zero}");
    assert_eq!(zero.issues[0].error.kind(), "component_not_found");
    assert!(p.lint_scene(2).is_err());
}

#[test]
fn beats_group_numbered_keys_and_merge_a_move() {
    let t = Temp::new("beats");
    let dots: String = (0..4)
        .map(|i| boxed(&format!("d{i}"), &format!("{}", 100 + i * 150), "100", 40))
        .collect();
    let mover = boxed("m", "100 + clamp(t - 1, 0, 1) * 400", "300", 40);
    let late = format!("{{t > 2.5 ? {} : null}}", boxed("late", "600", "300", 40));
    let p = t.scene(
        &format!("<Box style={{{{ flexGrow: 1 }}}}>{dots}{mover}{late}</Box>"),
        json!({ "component": "A", "hold": 3 }),
    );
    let look = p.look(&[0]).pop().unwrap().unwrap();
    let lines: Vec<String> = look.beats().iter().map(|b| b.line()).collect();
    let text = lines.join("\n");
    assert!(
        lines[0].starts_with("  0.00  appear   d0-d3  (centre (345,120))"),
        "{text}"
    );
    assert!(
        text.contains("  1.00  move     m  (120,320) → (520,320) over 1.0 s"),
        "{text}"
    );
    assert!(
        text.contains("  2.60  appear   late  at (620,320) 40x40"),
        "{text}"
    );
    assert_eq!(lines.len(), 4, "{text}");
}

#[test]
fn a_pause_is_not_still_and_is_a_beat() {
    let t = Temp::new("pause");
    let manifest = |text: &str, pauses: Value| {
        let words = json!([
            { "text": "One.", "start": 0.0, "end": 0.8, "confidence": -0.5 },
            { "text": "Two.", "start": 5.0, "end": 5.8, "confidence": -0.5 },
            { "text": "Three.", "start": 10.0, "end": 10.8, "confidence": -0.5 }
        ]);
        json!({ "version": 1, "scenes": { "a": {
            "key": "k", "text": text, "audio": "k.wav", "duration": 11.0, "words": words,
            "pauses": pauses } } })
        .to_string()
    };
    // Eleven seconds of narration over one frame, eight of them pauses.
    t.file(
        "script.md",
        "## a\nOne. [pause 4]\nTwo. [pause 4]\nThree.\n",
    )
    .file(
        "narration/manifest.json",
        &manifest(
            "One. [pause 4] Two. [pause 4] Three.",
            json!([
                { "after": 0, "start": 1.0, "end": 5.0 },
                { "after": 1, "start": 6.0, "end": 10.0 }
            ]),
        ),
    );
    let p = t.scene(&spread(""), json!({ "id": "a", "component": "A" }));
    assert_eq!(kinds(&p), Vec::<&str>::new());
    let look = p.look(&[0]).pop().unwrap().unwrap();
    let pause = look
        .beats()
        .into_iter()
        .find(|b| b.event == "pause")
        .unwrap();
    assert_eq!(pause.line(), "  1.25  pause    4.0 s  \"One.\"");
    t.file("script.md", "## a\nOne. Two. Three.\n").file(
        "narration/manifest.json",
        &manifest("One. Two. Three.", json!([])),
    );
    let p = t.scene(&spread(""), json!({ "id": "a", "component": "A" }));
    assert_eq!(kinds(&p), ["still"], "without the pause it is still");
}
