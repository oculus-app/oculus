//! Two Canvas files with one filename in a subject each keep their own path.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::{answer, rig, Rig};
use crate::sync::{Engine, FileEvent, Reporter, Subject, SyncOptions};

const FIRST: &str = "courses/SUBJ/Course/Files/week06b.pdf";

struct Files(Arc<Mutex<Vec<FileEvent>>>);
impl Reporter for Files {
    fn file(&self, file: &FileEvent) {
        self.0.lock().unwrap().push(file.clone());
    }
}

/// One Canvas file: its id, filename and bytes.
type Remote = (i64, &'static str, &'static [u8]);

/// A course whose one module lists `module` in order and whose Files listing
/// is empty; every file in `files` is served by id.
fn course(files: Arc<Mutex<Vec<Remote>>>, module: Arc<Mutex<Vec<i64>>>) -> Rig {
    rig(move |header, _| {
        let path = header["path"].as_str().unwrap_or("");
        let files = files.lock().unwrap().clone();
        let info = |(id, name, bytes): Remote| {
            let kind = if name.ends_with(".mp4") {
                "video/mp4"
            } else {
                "application/pdf"
            };
            json!({"id": id, "filename": name, "content-type": kind, "size": bytes.len(),
                "modified_at": format!("2026-10-01T00:00:{:02}Z", id % 60)})
        };
        let find = |id: &str| files.iter().copied().find(|f| f.0.to_string() == id);
        let body: Value = if path.starts_with("/api/v1/courses/1?") {
            json!({"name": "Subject"})
        } else if path.starts_with("/api/v1/courses/1/modules?") {
            let items: Vec<Value> = module
                .lock()
                .unwrap()
                .iter()
                .map(|id| json!({"type": "File", "content_id": id, "title": format!("File {id}")}))
                .collect();
            json!([{"name": "Week", "position": 1, "items": items}])
        } else if path.starts_with("/api/v1/courses/1/files?") {
            json!(files.iter().copied().map(info).collect::<Vec<_>>())
        } else if let Some(id) = path.strip_prefix("/download/") {
            return match find(id) {
                Some((_, _, bytes)) => answer(200, &[("content-type", "application/pdf")], bytes),
                None => answer(404, &[], b""),
            };
        } else if let Some(rest) = path.strip_prefix("/api/v1/files/") {
            if let Some(id) = rest.strip_suffix("/public_url") {
                json!({"public_url": format!("/download/{id}")})
            } else {
                match find(rest) {
                    Some(file) => info(file),
                    None => return answer(404, &[], b"{}"),
                }
            }
        } else {
            return answer(404, &[], b"{}");
        };
        answer(
            200,
            &[("content-type", "application/json")],
            &serde_json::to_vec(&body).unwrap(),
        )
    })
}

/// Sync the subject once, returning each Canvas file's (path, action).
fn sync(r: &Rig) -> BTreeMap<i64, (String, &'static str)> {
    let events = Arc::new(Mutex::new(Vec::new()));
    Engine::new(&r.dir, Box::new(Files(events.clone())))
        .with_pdf_parsing(false)
        .with_options(SyncOptions {
            announcements: false,
            assignments: false,
            ed: false,
            ed_lessons: false,
            ..SyncOptions::default()
        })
        .scrape(&[Subject {
            id: 1,
            code: "SUBJ".into(),
        }]);
    let events = events.lock().unwrap();
    let mut out = BTreeMap::new();
    for event in events.iter() {
        if let Some(id) = event.canvas_id {
            let previous = out.insert(id, (event.relative_path.clone(), event.action));
            assert!(previous.is_none(), "file {id} reported twice");
        }
    }
    out
}

fn bytes_at(r: &Rig, rel: &str) -> Vec<u8> {
    std::fs::read(r.dir.join(rel)).unwrap()
}

fn module_toc(r: &Rig) -> String {
    std::fs::read_to_string(r.dir.join("courses/SUBJ/Course/Modules/01-week.md")).unwrap()
}

fn downloads(r: &Rig, id: i64) -> usize {
    let path = format!("/download/{id}");
    r.paths().iter().filter(|p| **p == path).count()
}

fn shared<T>(value: T) -> Arc<Mutex<T>> {
    Arc::new(Mutex::new(value))
}

const A: Remote = (11, "week06b.pdf", b"%PDF-first, the longer one");
const B: Remote = (22, "week06b.pdf", b"%PDF-second");
const SECOND: &str = "courses/SUBJ/Course/Files/week06b-22.pdf";

#[test]
fn two_files_with_one_name_are_both_kept_at_stable_paths() {
    let module = shared(vec![11, 22]);
    let r = course(shared(vec![A, B]), module.clone());

    let first = sync(&r);
    assert_eq!(first[&11], (FIRST.to_string(), "new"));
    assert_eq!(first[&22], (SECOND.to_string(), "new"));
    assert_eq!(bytes_at(&r, FIRST), A.2);
    assert_eq!(bytes_at(&r, SECOND), B.2);
    let toc = module_toc(&r);
    assert!(toc.contains("[File 11](../Files/week06b.pdf)"), "{toc}");
    assert!(toc.contains("[File 22](../Files/week06b-22.pdf)"), "{toc}");

    // Reordering the module moves neither file.
    *module.lock().unwrap() = vec![22, 11];
    let second = sync(&r);
    assert_eq!(second[&11], (FIRST.to_string(), "unchanged"));
    assert_eq!(second[&22], (SECOND.to_string(), "unchanged"));
    assert_eq!((downloads(&r, 11), downloads(&r, 22)), (1, 1));

    // A lost path record costs nothing: both are found where they are.
    std::fs::remove_file(r.dir.join("file-paths.json")).unwrap();
    let third = sync(&r);
    assert_eq!(third[&11], (FIRST.to_string(), "unchanged"));
    assert_eq!(third[&22], (SECOND.to_string(), "unchanged"));
    assert_eq!((downloads(&r, 11), downloads(&r, 22)), (1, 1));
}

/// A library from before paths were recorded: both ids in the manifest, one
/// file on disk holding the bytes of whichever was saved last.
fn overwritten(r: &Rig, kept: Remote) {
    let path = r.dir.join(FIRST);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, kept.2).unwrap();
    let manifest: BTreeMap<String, (String, u64)> = [A, B]
        .iter()
        .map(|(id, _, bytes)| {
            let modified = format!("2026-10-01T00:00:{:02}Z", id % 60);
            (id.to_string(), (modified, bytes.len() as u64))
        })
        .collect();
    std::fs::write(
        r.dir.join("file-manifest.json"),
        serde_json::to_string(&manifest).unwrap(),
    )
    .unwrap();
}

#[test]
fn an_overwritten_file_is_recovered_and_the_survivor_keeps_its_path() {
    for order in [[11, 22], [22, 11]] {
        for (kept, lost) in [(A, B), (B, A)] {
            let r = course(shared(vec![A, B]), shared(order.to_vec()));
            overwritten(&r, kept);
            let recovered = format!("courses/SUBJ/Course/Files/week06b-{}.pdf", lost.0);

            let first = sync(&r);
            assert_eq!(first[&kept.0], (FIRST.to_string(), "unchanged"));
            assert_eq!(first[&lost.0], (recovered.clone(), "new"));
            assert_eq!(bytes_at(&r, FIRST), kept.2);
            assert_eq!(bytes_at(&r, &recovered), lost.2);
            assert_eq!((downloads(&r, kept.0), downloads(&r, lost.0)), (0, 1));

            let second = sync(&r);
            assert_eq!(second[&kept.0], (FIRST.to_string(), "unchanged"));
            assert_eq!(second[&lost.0], (recovered, "unchanged"));
        }
    }
}

#[test]
fn recovery_leaves_a_survivor_canvas_has_dropped() {
    let r = course(shared(vec![A]), shared(vec![11]));
    overwritten(&r, B);
    let first = sync(&r);
    let recovered = "courses/SUBJ/Course/Files/week06b-11.pdf";
    assert_eq!(first[&11], (recovered.to_string(), "new"));
    assert_eq!(bytes_at(&r, recovered), A.2);
    assert_eq!(bytes_at(&r, FIRST), B.2);
}

#[test]
fn a_new_file_leaves_a_live_one_saved_before_paths_were_recorded() {
    const NEW: Remote = (33, "week06b.pdf", b"%PDF-third, new");
    let r = course(shared(vec![NEW, B]), shared(vec![33, 22]));
    overwritten(&r, B);
    let first = sync(&r);
    assert_eq!(first[&33].0, "courses/SUBJ/Course/Files/week06b-33.pdf");
    assert_eq!(first[&22], (FIRST.to_string(), "unchanged"));
    assert_eq!(bytes_at(&r, FIRST), B.2);
}

#[test]
fn files_of_equal_size_are_checked_against_their_bytes() {
    const SAME_A: Remote = (11, "week06b.pdf", b"%PDF-aaaa");
    const SAME_B: Remote = (22, "week06b.pdf", b"%PDF-bbbb");
    let r = course(shared(vec![SAME_A, SAME_B]), shared(vec![11, 22]));
    let path = r.dir.join(FIRST);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, SAME_B.2).unwrap();
    std::fs::write(
        r.dir.join("file-manifest.json"),
        r#"{"11": ["2026-10-01T00:00:11Z", 9], "22": ["2026-10-01T00:00:22Z", 9]}"#,
    )
    .unwrap();

    let first = sync(&r);
    assert_eq!(first[&11], (FIRST.to_string(), "updated"));
    assert_eq!(first[&22], (SECOND.to_string(), "new"));
    assert_eq!(bytes_at(&r, FIRST), SAME_A.2);
    assert_eq!(bytes_at(&r, SECOND), SAME_B.2);
}

#[test]
fn a_file_uploaded_again_takes_the_path_of_the_one_it_replaced() {
    const AGAIN: Remote = (33, "week06b.pdf", b"%PDF-revised");
    let files = shared(vec![A]);
    let module = shared(vec![11]);
    let r = course(files.clone(), module.clone());
    sync(&r);

    *files.lock().unwrap() = vec![AGAIN];
    *module.lock().unwrap() = vec![33];
    let second = sync(&r);
    assert_eq!(second[&33], (FIRST.to_string(), "updated"));
    assert_eq!(bytes_at(&r, FIRST), AGAIN.2);
}

#[test]
fn names_that_differ_only_in_case_or_punctuation_do_not_share_a_file() {
    const UPPER: Remote = (11, "Week 1.pdf", b"%PDF-upper");
    const LOWER: Remote = (22, "week_1.pdf", b"%PDF-lower, longer");
    let r = course(shared(vec![UPPER, LOWER]), shared(vec![11, 22]));
    let first = sync(&r);
    assert_eq!(first[&11].0, "courses/SUBJ/Course/Files/Week_1.pdf");
    assert_eq!(first[&22].0, "courses/SUBJ/Course/Files/week_1-22.pdf");
    assert_eq!(bytes_at(&r, &first[&11].0), UPPER.2);
    assert_eq!(bytes_at(&r, &first[&22].0), LOWER.2);
}

#[test]
fn videos_with_one_name_download_to_the_paths_their_module_lists() {
    const ONE: Remote = (11, "talk.mp4", b"first video, longer");
    const TWO: Remote = (22, "talk.mp4", b"second video");
    let r = course(shared(vec![ONE, TWO]), shared(vec![11, 22]));
    sync(&r);
    let toc = module_toc(&r);
    assert!(toc.contains("(../Media/talk.mp4) _(video 11)_"), "{toc}");
    assert!(toc.contains("(../Media/talk-22.mp4) _(video 22)_"), "{toc}");

    let subject = Subject {
        id: 1,
        code: "SUBJ".into(),
    };
    let download = |id| {
        Engine::new(&r.dir, Box::new(crate::sync::Silent))
            .download_video(&subject, id, &|_| {}, &|| false)
            .unwrap()
    };
    // The second first: the order of downloads does not decide the paths.
    assert_eq!(download(22), "courses/SUBJ/Course/Media/talk-22.mp4");
    assert_eq!(download(11), "courses/SUBJ/Course/Media/talk.mp4");
    assert_eq!(bytes_at(&r, "courses/SUBJ/Course/Media/talk.mp4"), ONE.2);
    assert_eq!(bytes_at(&r, "courses/SUBJ/Course/Media/talk-22.mp4"), TWO.2);
}
