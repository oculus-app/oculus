//! A challenge's workspace folder mirrors Ed's zip, from the download on:
//! no network, the zip handed in as the download's result.

use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex};

use super::ed_lessons::{lesson_stem, slide_stem};
use super::ed_workspace::{slide_stem_of, EDIT_RECORDS};
use crate::library::paths;
use crate::sync::{Engine, FileEvent, Mirrored, Reporter, Subject};
use crate::test_support::Scratch;

const SLIDE: &str = "Course/Lessons/1-l/03-q1a";
const FOLDER: &str = "courses/COMP30026/Course/Lessons/1-l/03-q1a";

#[derive(Default)]
struct Seen {
    files: Vec<(String, &'static str)>,
    logs: Vec<(String, String)>,
}

#[derive(Clone, Default)]
struct Recorder(Arc<Mutex<Seen>>);

impl Reporter for Recorder {
    fn file(&self, f: &FileEvent) {
        let mut seen = self.0.lock().unwrap();
        seen.files.push((f.relative_path.clone(), f.action));
    }
    fn log(&self, level: &str, _course: &str, message: &str) {
        let mut seen = self.0.lock().unwrap();
        seen.logs.push((level.to_string(), message.to_string()));
    }
}

fn engine(dir: &Path) -> (Engine, Recorder) {
    let seen = Recorder::default();
    let mut engine = Engine::new(dir, Box::new(seen.clone()));
    engine.parse_pdfs = false;
    (engine, seen)
}

fn subject() -> Subject {
    Subject {
        id: 1,
        code: "COMP30026".into(),
    }
}

fn zip_of(entries: &[(&str, &str)]) -> Vec<u8> {
    let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let opts = zip::write::SimpleFileOptions::default();
    for (name, body) in entries {
        w.start_file(*name, opts).unwrap();
        w.write_all(body.as_bytes()).unwrap();
    }
    w.finish().unwrap().into_inner()
}

fn write(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

/// Every file under `root`, relative, with its text; hidden ones included.
fn tree(root: &Path) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if entry.file_type().unwrap().is_dir() {
                pending.push(entry.path());
            } else {
                let rel = entry.path().strip_prefix(root).unwrap().to_owned();
                let text = std::fs::read_to_string(entry.path()).unwrap();
                out.insert(rel.to_string_lossy().replace('\\', "/"), text);
            }
        }
    }
    out
}

/// A challenge folder with local edits: one of Ed's files changed, a file
/// Ed lacks, a conflict copy, a folder only here, and a dotfile.
fn edited_folder(data: &Path) -> std::path::PathBuf {
    let root = data.join(FOLDER);
    write(&root, "q1a.py", "dfa = 'mine'\n");
    write(&root, "extra.py", "print('only here')\n");
    write(&root, "q1a.ed-server.py", "dfa = 'theirs'\n");
    write(&root, "scratch/notes/try.py", "x = 1\n");
    write(&root, ".q1a.py.swp", "swap");
    write(&root, "src/keep.txt", "old\n");
    // The slide file and the lesson index sit beside the folder, not in it.
    write(data.join(FOLDER).parent().unwrap(), "03-q1a.md", "# Q1a\n");
    write(data.join(FOLDER).parent().unwrap(), "../1-l.md", "# L\n");
    root
}

#[test]
fn a_synced_challenge_folder_ends_exactly_as_eds_zip() {
    let data = Scratch::new("ed-mirror-zip");
    let root = edited_folder(&data);
    let zip = zip_of(&[
        ("q1a.py", "dfa = 'ed'\n"),
        ("src/keep.txt", "old\n"),
        ("src/new/data.txt", "d\n"),
    ]);
    let (engine, seen) = engine(&data);

    let mirrored = engine.mirror_workspace(&subject(), "Q1a", SLIDE, Ok(zip), true);

    assert_eq!(
        mirrored,
        Ok(Mirrored {
            added: 1,
            updated: 1,
            unchanged: 1,
            removed: 4,
        })
    );
    let want: BTreeMap<String, String> = [
        ("q1a.py", "dfa = 'ed'\n"),
        ("src/keep.txt", "old\n"),
        ("src/new/data.txt", "d\n"),
    ]
    .iter()
    .map(|(p, t)| (p.to_string(), t.to_string()))
    .collect();
    assert_eq!(tree(&root), want);
    assert!(!root.join("scratch").exists(), "emptied folders go");
    let lessons = data.join(FOLDER).parent().unwrap().to_path_buf();
    assert!(lessons.join("03-q1a.md").is_file());
    assert!(lessons.parent().unwrap().join("1-l.md").is_file());

    let seen = seen.0.lock().unwrap();
    assert_eq!(
        seen.files,
        [
            // Every deleted file is reported, so its row goes too.
            (format!("{FOLDER}/.q1a.py.swp"), "removed"),
            (format!("{FOLDER}/extra.py"), "removed"),
            (format!("{FOLDER}/q1a.ed-server.py"), "removed"),
            (format!("{FOLDER}/scratch/notes/try.py"), "removed"),
            (format!("{FOLDER}/q1a.py"), "updated"),
            (format!("{FOLDER}/src/keep.txt"), "unchanged"),
            (format!("{FOLDER}/src/new/data.txt"), "new"),
        ]
    );
    for gone in [
        ".q1a.py.swp",
        "extra.py",
        "q1a.ed-server.py",
        "scratch/notes/try.py",
    ] {
        assert!(
            seen.logs
                .iter()
                .any(|(level, line)| level == "info" && line.contains(gone)),
            "{gone} deleted without a line"
        );
    }
    // The edited file and the two only here; not the copy or the dotfile.
    assert_eq!(engine.replaced_edits.get(), 3);
}

#[test]
fn a_failed_download_leaves_the_folder_untouched() {
    let data = Scratch::new("ed-mirror-failed");
    let root = edited_folder(&data);
    let before = tree(&root);
    let (engine, seen) = engine(&data);

    let failed = |zip| engine.mirror_workspace(&subject(), "Q1a", SLIDE, zip, true);
    assert_eq!(
        failed(Err("could not reach the workspace server (Dns)".into())),
        Err("could not reach the workspace server (Dns)".into())
    );
    assert!(failed(Ok(b"not a zip".to_vec())).is_err());

    assert_eq!(tree(&root), before);
    assert_eq!(engine.replaced_edits.get(), 0);
    let seen = seen.0.lock().unwrap();
    assert!(seen.files.is_empty());
    let levels: Vec<&str> = seen.logs.iter().map(|(l, _)| l.as_str()).collect();
    assert_eq!(levels, ["warning", "warning"]);
    assert!(
        seen.logs[0].1.contains("could not reach"),
        "{:?}",
        seen.logs
    );
}

#[test]
fn an_empty_workspace_on_ed_empties_the_folder_and_says_so() {
    let data = Scratch::new("ed-mirror-empty");
    let root = edited_folder(&data);
    let (engine, seen) = engine(&data);

    let mirrored = engine.mirror_workspace(&subject(), "Q1a", SLIDE, Ok(zip_of(&[])), false);

    assert_eq!(
        mirrored,
        Ok(Mirrored {
            removed: 6,
            ..Mirrored::default()
        })
    );
    assert!(!root.exists());
    assert!(data.join(FOLDER).with_extension("md").is_file());
    assert_eq!(engine.replaced_edits.get(), 0, "no edit record, no count");
    let seen = seen.0.lock().unwrap();
    assert!(seen
        .logs
        .iter()
        .any(|(level, line)| level == "info" && line.contains("workspace is empty")));
    assert!(seen.logs.iter().all(|(level, _)| level == "info"));
}

#[test]
fn a_kept_pdf_keeps_its_parse_and_a_dropped_one_takes_its_parse_along() {
    let data = Scratch::new("ed-mirror-parse");
    let root = data.join(FOLDER);
    write(&root, "notes.pdf", "pdf");
    write(&root, "notes.md", "parsed text");
    write(&root, "notes_images/p1.png", "png");
    write(&root, "old.pdf", "pdf");
    write(&root, "old.md", "parsed text");
    write(&root, "old_images/p1.png", "png");
    let (engine, _) = engine(&data);

    engine
        .mirror_workspace(
            &subject(),
            "Q1a",
            SLIDE,
            Ok(zip_of(&[("notes.pdf", "pdf")])),
            false,
        )
        .unwrap();

    assert_eq!(
        tree(&root).into_keys().collect::<Vec<_>>(),
        ["notes.md", "notes.pdf", "notes_images/p1.png"]
    );
}

#[test]
fn a_finished_run_says_how_many_edits_it_replaced_and_drops_the_records() {
    let data = Scratch::new("ed-mirror-records");
    write(&data.join(EDIT_RECORDS), "281410.json", "{}");
    let (engine, seen) = engine(&data);
    engine.replaced_edits.set(3);

    engine.forget_edit_records();

    assert!(!data.join(EDIT_RECORDS).exists());
    let logs = |seen: &Recorder| seen.0.lock().unwrap().logs.clone();
    assert_eq!(logs(&seen).len(), 1);
    assert!(logs(&seen)[0].1.starts_with("3 local edits were replaced"));

    // With no records left, a later run says nothing.
    engine.forget_edit_records();
    assert_eq!(logs(&seen).len(), 1);
}

#[test]
fn a_slide_files_path_gives_back_the_stem_the_sync_mirrored_under() {
    let code = "COMP 30026";
    let lesson = lesson_stem(1234, "Week 3: DFAs & NFAs!");
    let stem = slide_stem(&lesson, 3, "Q1a — Build a DFA");
    // The slide's file as the sync writes it (`write_synced`), which is the
    // path the lesson view finds beside the index.
    let md = paths::course_rel_path(code, &format!("{stem}.md")).unwrap();

    assert_eq!(slide_stem_of(code, &md).as_deref(), Ok(stem.as_str()));
    assert_eq!(
        paths::course_rel_path(code, &stem).as_deref(),
        md.strip_suffix(".md"),
        "the mirror writes the folder beside the slide file"
    );
}

#[test]
fn a_path_that_is_not_a_lesson_slide_is_refused_before_anything_is_fetched() {
    let data = Scratch::new("ed-mirror-stem");
    let (engine, seen) = engine(&data);
    for slide_md in [
        "courses/OTHER/Course/Lessons/1-l/03-q1a.md",
        "courses/COMP30026/Course/Files/notes.md",
        "courses/COMP30026/Course/Lessons/1-l.md",
        "courses/COMP30026/Course/Lessons/1-l/03-q1a/deeper.md",
        "courses/COMP30026/Course/Lessons/1-l/../03-q1a.md",
        "courses/COMP30026/Course/Lessons/1-l//03-q1a.md",
        "courses/COMP30026/Course/Lessons/1-l/03-q1a.pdf",
        FOLDER,
    ] {
        let refused = engine.resync_workspace(&subject(), 281410, "Q1a", slide_md);
        assert!(refused.is_err(), "{slide_md} was taken");
    }
    assert_eq!(
        slide_stem_of("COMP30026", &format!("{FOLDER}.md")).as_deref(),
        Ok(SLIDE)
    );
    assert!(seen.0.lock().unwrap().files.is_empty());
}
