use std::path::Path;

use serde_json::{Map, Value};

use super::{dict, store, suggestion};
use crate::studio::voice::review::history::Event;
use crate::studio::voice::review::{Decision, Kind, Logged, Store};
use crate::test_support::Scratch;

fn keys(path: &Path) -> Vec<String> {
    let text = std::fs::read_to_string(path).unwrap();
    serde_json::from_str::<Map<String, Value>>(&text)
        .unwrap()
        .keys()
        .cloned()
        .collect()
}

fn value(path: &Path, word: &str) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let map: Map<String, Value> = serde_json::from_str(&text).unwrap();
    map.get(word).and_then(Value::as_str).map(str::to_owned)
}

fn kinds(s: &Store) -> Vec<(Kind, bool)> {
    s.history()
        .read()
        .unwrap()
        .into_iter()
        .map(|l| (l.event.kind, l.reverted))
        .collect()
}

fn latest(s: &Store) -> Logged {
    s.history().read().unwrap().remove(0)
}

#[test]
fn the_log_reads_newest_first_skips_a_broken_line_and_marks_what_was_reverted() {
    let dir = Scratch::new("history-log");
    let s = store(&dir);
    assert!(s.history().read().unwrap().is_empty(), "no file, no events");
    let first = Event::new(Kind::Added, "Euler", None);
    let second = Event::new(Kind::Edited, "Euler", None);
    s.history().append(&first).unwrap();
    s.history().append(&second).unwrap();
    let path = dir.join("pronunciations/history.jsonl");
    let mut text = std::fs::read_to_string(&path).unwrap();
    text.push_str("{not json\n\n");
    std::fs::write(&path, text).unwrap();
    s.history()
        .append(&Event {
            reverts: Some(first.id.clone()),
            ..Event::new(Kind::Reverted, "Euler", None)
        })
        .unwrap();

    let read = s.history().read().unwrap();
    let ids: Vec<&str> = read.iter().map(|l| l.event.id.as_str()).collect();
    assert_eq!(ids.len(), 3);
    assert_eq!(ids[1..], [second.id.as_str(), first.id.as_str()]);
    assert_eq!(
        kinds(&s),
        [
            (Kind::Reverted, false),
            (Kind::Edited, false),
            (Kind::Added, true)
        ]
    );
    assert_ne!(first.id, second.id);
    let json = serde_json::to_value(&read[2]).unwrap();
    assert_eq!(json["kind"], "added");
    assert_eq!(json["reverted"], true);
    assert_eq!(json["previous"], Value::Null);
    let line = std::fs::read_to_string(&path).unwrap();
    assert!(!line.contains("\"reverted\":"), "reverted is not stored");
}

#[test]
fn setting_and_removing_keep_the_other_keys_in_place_and_log_each_change() {
    let dir = Scratch::new("history-set");
    let s = store(&dir);
    let d = dict();
    let path = dir.join("subjects/COMP30027/lexicon.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        &path,
        r#"{"_about": "comment", "softmax": "SOFT-max", "z": "/zˈi/"}"#,
    )
    .unwrap();

    let added = s
        .set_entry(Some("COMP30027"), " Nesterov ", " NESS-ter-off ", &d)
        .unwrap();
    assert_eq!(added.word, "Nesterov");
    assert_eq!(added.reading, "NESS-ter-off");
    assert!(added.phonemes.unwrap().starts_with("nˈɛs"));
    s.set_entry(Some("COMP30027"), "softmax", "SOFT", &d)
        .unwrap();
    assert_eq!(keys(&path), ["_about", "softmax", "z", "Nesterov"]);
    assert_eq!(value(&path, "softmax").as_deref(), Some("SOFT"));

    let before = std::fs::metadata(&path).unwrap().modified().unwrap();
    s.set_entry(Some("COMP30027"), "softmax", "SOFT", &d)
        .unwrap();
    assert_eq!(
        std::fs::metadata(&path).unwrap().modified().unwrap(),
        before
    );
    assert_eq!(kinds(&s).len(), 2, "the same value is no change");

    s.remove_entry(Some("COMP30027"), "softmax").unwrap();
    assert_eq!(keys(&path), ["_about", "z", "Nesterov"]);
    let e = s.remove_entry(Some("COMP30027"), "softmax").unwrap_err();
    assert!(e.contains("\"softmax\" is not in"), "{e}");

    let log = s.history().read().unwrap();
    let got: Vec<(Kind, Option<&str>, Option<&str>)> = log
        .iter()
        .map(|l| {
            (
                l.event.kind,
                l.event.previous.as_deref(),
                l.event.reading.as_deref(),
            )
        })
        .collect();
    assert_eq!(
        got,
        [
            (Kind::Removed, Some("SOFT"), None),
            (Kind::Edited, Some("SOFT-max"), Some("SOFT")),
            (Kind::Added, None, Some("NESS-ter-off")),
        ]
    );
    assert!(log
        .iter()
        .all(|l| l.event.subject.as_deref() == Some("COMP30027")));

    assert!(s.set_entry(None, "x", "  ", &d).is_err());
    assert!(s.set_entry(Some("../x"), "x", "SOFT", &d).is_err());
    let e = s.set_entry(None, "x", "NESS-tur", &d).unwrap_err();
    assert!(e.contains("\"tur\""), "{e}");
    assert_eq!(kinds(&s).len(), 3, "a refused set logs nothing");
}

#[test]
fn deciding_and_marking_wrong_are_logged_with_the_value_before() {
    let dir = Scratch::new("history-decide");
    let s = store(&dir);
    let d = dict();
    std::fs::create_dir_all(dir.join("library")).unwrap();
    std::fs::write(dir.join("library/lexicon.json"), r#"{"Euler": "SOFT"}"#).unwrap();

    let item = s.suggest(suggestion("Euler", "EU-ler", None)).unwrap();
    s.decide(&item.id, Decision::Fine, &d).unwrap();
    let kept = latest(&s).event;
    assert_eq!(kept.kind, Kind::Kept);
    assert_eq!(kept.previous.as_deref(), Some("SOFT"));
    assert_eq!(kept.reading.as_deref(), Some("/nˈɛstəɹɔv/"));
    assert_eq!(kept.video.as_deref(), Some("momentum"));
    assert_eq!(kept.subject, None);

    let item = s
        .suggest(suggestion("Nesterov", "NESS-ter-off", Some("COMP30027")))
        .unwrap();
    s.decide(&item.id, Decision::Correct, &d).unwrap();
    let accepted = latest(&s).event;
    assert_eq!(accepted.kind, Kind::Accepted);
    assert_eq!(accepted.previous, None);
    assert_eq!(accepted.subject.as_deref(), Some("COMP30027"));

    let item = s
        .suggest(suggestion("Adam", "NESS", Some("COMP30027")))
        .unwrap();
    s.mark_wrong(&item.id, Some(" AD-um ".into())).unwrap();
    let wrong = latest(&s).event;
    assert_eq!(wrong.kind, Kind::Wrong);
    assert_eq!(wrong.reading.as_deref(), Some("NESS"));
    assert_eq!(wrong.note.as_deref(), Some("AD-um"));
    assert_eq!(wrong.previous, None);
    let e = s.revert(&wrong.id, &d).unwrap_err();
    assert!(e.contains("cannot be reverted"), "{e}");
}

#[test]
fn revert_puts_each_change_back_and_refuses_a_stale_or_repeated_one() {
    let dir = Scratch::new("history-revert");
    let s = store(&dir);
    let d = dict();
    let path = dir.join("library/lexicon.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, r#"{"_c": "x", "a": "/ˈA/", "b": "SOFT"}"#).unwrap();

    s.set_entry(None, "c", "SOFT-max", &d).unwrap();
    let added = latest(&s).event;
    s.set_entry(None, "a", "NESS", &d).unwrap();
    let edited = latest(&s).event;
    s.remove_entry(None, "b").unwrap();
    let removed = latest(&s).event;

    let undo = s.revert(&edited.id, &d).unwrap();
    assert_eq!(undo.event.kind, Kind::Reverted);
    assert_eq!(undo.event.reverts.as_deref(), Some(edited.id.as_str()));
    assert_eq!(undo.event.previous.as_deref(), Some("NESS"));
    assert_eq!(undo.event.reading.as_deref(), Some("/ˈA/"));
    assert_eq!(value(&path, "a").as_deref(), Some("/ˈA/"));
    assert_eq!(
        keys(&path),
        ["_c", "a", "c"],
        "a key put back keeps its place"
    );

    s.revert(&removed.id, &d).unwrap();
    assert_eq!(value(&path, "b").as_deref(), Some("SOFT"));
    s.revert(&added.id, &d).unwrap();
    assert_eq!(keys(&path), ["_c", "a", "b"]);

    let e = s.revert(&added.id, &d).unwrap_err();
    assert!(e.contains("already reverted"), "{e}");
    let e = s.revert("nope", &d).unwrap_err();
    assert!(e.contains("no pronunciation history event"), "{e}");

    s.set_entry(None, "b", "NESS", &d).unwrap();
    let stale = s
        .history()
        .read()
        .unwrap()
        .into_iter()
        .find(|l| l.event.kind == Kind::Edited && l.event.word == "a")
        .unwrap();
    assert!(stale.reverted);
    s.set_entry(None, "a", "SOFT", &d).unwrap();
    let edit_a = latest(&s).event;
    s.set_entry(None, "a", "NESS-ter", &d).unwrap();
    let e = s.revert(&edit_a.id, &d).unwrap_err();
    assert_eq!(e, "a has changed since; edit it in the lexicon");
    assert_eq!(value(&path, "a").as_deref(), Some("NESS-ter"));

    let item = s.suggest(suggestion("Euler", "SOFT", None)).unwrap();
    s.decide(&item.id, Decision::Correct, &d).unwrap();
    let accepted = latest(&s).event;
    s.revert(&accepted.id, &d).unwrap();
    assert_eq!(
        value(&path, "Euler"),
        None,
        "a word with no value before goes"
    );
    let item = s.suggest(suggestion("b", "SOFT-max", None)).unwrap();
    s.decide(&item.id, Decision::Fine, &d).unwrap();
    let kept = latest(&s).event;
    s.revert(&kept.id, &d).unwrap();
    assert_eq!(value(&path, "b").as_deref(), Some("NESS"));
}

#[test]
fn the_lexicon_lists_global_then_subjects_with_checks_and_overrides() {
    let dir = Scratch::new("history-list");
    let s = store(&dir);
    let d = dict();
    let write = |rel: &str, text: &str| {
        let path = dir.join(rel);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, text).unwrap();
    };
    write(
        "library/lexicon.json",
        r#"{"_c": "x", "Softmax": "SOFT-max", "z": "/zˈi/"}"#,
    );
    write("subjects/MAST20004/lexicon.json", r#"{"bad": "NESS-tur"}"#);
    write(
        "subjects/COMP30027/lexicon.json",
        r#"{"softmax": "SOFT", "new": "NESS"}"#,
    );
    std::fs::create_dir_all(dir.join("subjects/EMPTY")).unwrap();

    let all = s.lexicon(&d).unwrap();
    let rows: Vec<(Option<&str>, &str, bool)> = all
        .iter()
        .map(|e| (e.subject.as_deref(), e.word.as_str(), e.overrides))
        .collect();
    assert_eq!(
        rows,
        [
            (None, "Softmax", false),
            (None, "z", false),
            (Some("COMP30027"), "softmax", true),
            (Some("COMP30027"), "new", false),
            (Some("MAST20004"), "bad", false),
        ]
    );
    assert!(all[0].phonemes.is_some() && all[0].error.is_none());
    assert!(all[4].phonemes.is_none());
    assert!(all[4].error.as_deref().unwrap().contains("\"tur\""));

    let set = s.set_entry(Some("COMP30027"), "z", "SOFT", &d).unwrap();
    assert!(set.overrides);
    let json = serde_json::to_value(&set).unwrap();
    assert_eq!(json["subject"], "COMP30027");
    assert_eq!(json["error"], Value::Null);

    write("subjects/COMP30027/lexicon.json", "[]");
    let e = s.lexicon(&d).unwrap_err();
    assert!(
        e.contains("COMP30027/lexicon.json: not a JSON object"),
        "{e}"
    );
}
