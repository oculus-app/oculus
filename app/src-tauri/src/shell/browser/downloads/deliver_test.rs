use std::io::{Error, ErrorKind};
use std::path::{Path, PathBuf};

use super::deliver::{deliver, move_file, remove_staged};
use super::state::Target;
use super::SavedTo;
use crate::test_support::Scratch;

/// A staged download under `<data>/downloads/.incoming/<folder>/`.
fn stage(data: &Path, folder: &str, name: &str, bytes: &[u8]) -> PathBuf {
    let dir = data.join("downloads").join(".incoming").join(folder);
    std::fs::create_dir_all(&dir).unwrap();
    let staged = dir.join(name);
    std::fs::write(&staged, bytes).unwrap();
    staged
}

fn drive(rel: &str) -> Target {
    Target::Drive {
        target_dir: rel.into(),
        name: None,
    }
}

fn landed(saved: SavedTo) -> String {
    match saved {
        SavedTo::Drive { outcome } => outcome.file.expect("landed").relative_path,
        SavedTo::Path { .. } => panic!("not an upload"),
    }
}

#[test]
fn any_file_lands_in_the_subject_s_root_and_the_staged_copy_goes() {
    let data = Scratch::new("download-oculus");
    std::fs::create_dir_all(data.join("courses/COMP10001")).unwrap();
    let staged = stage(&data, "1-1", "data set.zip", b"PK zip");
    let saved = deliver(&data, &staged, &drive("courses/COMP10001")).unwrap();
    let SavedTo::Drive { outcome } = saved else {
        panic!("not an upload");
    };
    let file = outcome.file.expect("landed");
    assert_eq!(file.relative_path, "courses/COMP10001/data set.zip");
    assert_eq!(file.file_type, "zip");
    assert_eq!(
        outcome.error, None,
        "not an Office file, nothing to convert"
    );
    assert_eq!(
        std::fs::read(data.join(&file.relative_path)).unwrap(),
        b"PK zip"
    );
    assert!(!staged.parent().unwrap().exists(), "staging folder removed");
}

#[test]
fn uploads_rules_apply_a_taken_name_steps_aside_and_same_bytes_dedupe() {
    let data = Scratch::new("download-oculus-names");
    std::fs::create_dir_all(data.join("courses/MAST20004")).unwrap();
    let rel = landed;
    let first = stage(&data, "1-1", "notes.txt", b"one");
    let again = stage(&data, "1-2", "notes.txt", b"one");
    let other = stage(&data, "1-3", "notes.txt", b"two");
    let code = drive("courses/MAST20004");
    assert_eq!(
        rel(deliver(&data, &first, &code).unwrap()),
        "courses/MAST20004/notes.txt"
    );
    assert_eq!(
        rel(deliver(&data, &again, &code).unwrap()),
        "courses/MAST20004/notes.txt"
    );
    assert_eq!(
        rel(deliver(&data, &other, &code).unwrap()),
        "courses/MAST20004/notes (2).txt"
    );
}

#[test]
fn a_chosen_folder_of_the_student_s_takes_the_download() {
    let data = Scratch::new("download-oculus-folder");
    std::fs::create_dir_all(data.join("courses/COMP10001/Exam prep")).unwrap();
    let staged = stage(&data, "1-1", "past paper.pdf", b"%PDF");
    let to = drive("courses/COMP10001/Exam prep");
    assert_eq!(
        landed(deliver(&data, &staged, &to).unwrap()),
        "courses/COMP10001/Exam prep/past paper.pdf"
    );

    std::fs::create_dir_all(data.join("courses/COMP10001/Course/Files")).unwrap();
    let staged = stage(&data, "1-2", "x.pdf", b"%PDF");
    for refused in [
        "courses/COMP10001/Course/Files",
        "courses",
        ".oculus",
        "courses/COMP10001/Gone",
    ] {
        assert!(
            deliver(&data, &staged, &drive(refused)).is_err(),
            "never into {refused}"
        );
    }
    assert!(staged.exists(), "a refused delivery keeps the staged copy");
}

#[test]
fn a_download_lands_at_the_top_level_or_in_a_folder_there() {
    let data = Scratch::new("download-drive-top");
    std::fs::create_dir_all(data.join("Receipts")).unwrap();
    let staged = stage(&data, "1-1", "timetable.png", b"PNG");
    assert_eq!(
        landed(deliver(&data, &staged, &drive("")).unwrap()),
        "timetable.png"
    );
    let staged = stage(&data, "1-2", "order.pdf", b"%PDF");
    assert_eq!(
        landed(deliver(&data, &staged, &drive("Receipts")).unwrap()),
        "Receipts/order.pdf"
    );
    let staged = stage(&data, "1-3", "courses", b"x");
    assert_eq!(
        landed(deliver(&data, &staged, &drive("")).unwrap()),
        "courses (2)",
        "never the name of the folder of subjects"
    );
}

#[test]
fn a_renamed_download_takes_its_new_name_through_the_upload_rules() {
    let data = Scratch::new("download-drive-renamed");
    std::fs::create_dir_all(data.join("Receipts")).unwrap();
    let as_kit = Target::Drive {
        target_dir: "Receipts".into(),
        name: Some("Lab kit.pdf".into()),
    };
    let staged = stage(&data, "1-1", "download.pdf", b"one");
    assert_eq!(
        landed(deliver(&data, &staged, &as_kit).unwrap()),
        "Receipts/Lab kit.pdf"
    );
    assert!(!staged.parent().unwrap().exists(), "staging folder removed");
    let same = stage(&data, "1-2", "other.pdf", b"one");
    assert_eq!(
        landed(deliver(&data, &same, &as_kit).unwrap()),
        "Receipts/Lab kit.pdf",
        "the same bytes keep the name"
    );
    let different = stage(&data, "1-3", "download.pdf", b"two");
    assert_eq!(
        landed(deliver(&data, &different, &as_kit).unwrap()),
        "Receipts/Lab kit (2).pdf"
    );
}

#[test]
fn a_download_whose_bytes_were_already_there_says_so_and_writes_nothing() {
    let data = Scratch::new("download-drive-existed");
    std::fs::create_dir_all(data.join("Receipts")).unwrap();
    std::fs::write(data.join("Receipts/order.pdf"), b"%PDF mine").unwrap();
    let outcome = |saved: SavedTo| match saved {
        SavedTo::Drive { outcome } => outcome,
        SavedTo::Path { .. } => panic!("not an upload"),
    };
    let same = stage(&data, "1-1", "order.pdf", b"%PDF mine");
    let found = outcome(deliver(&data, &same, &drive("Receipts")).unwrap());
    assert_eq!(found.file.unwrap().relative_path, "Receipts/order.pdf");
    assert!(found.existed, "the student's own file, not this download's");

    let other = stage(&data, "1-2", "order.pdf", b"%PDF new");
    let wrote = outcome(deliver(&data, &other, &drive("Receipts")).unwrap());
    assert_eq!(wrote.file.unwrap().relative_path, "Receipts/order (2).pdf");
    assert!(!wrote.existed);
}

#[test]
fn a_path_delivery_moves_the_file_and_never_replaces_unasked() {
    let data = Scratch::new("download-path");
    let mac = Scratch::new("download-path-mac");
    let staged = stage(&data, "1-1", "a.pdf", b"new");
    let to = mac.join("a.pdf");
    let saved = deliver(
        &data,
        &staged,
        &Target::Path {
            path: to.clone(),
            may_replace: false,
        },
    )
    .unwrap();
    assert!(matches!(saved, SavedTo::Path { path } if path == to.to_string_lossy()));
    assert_eq!(std::fs::read(&to).unwrap(), b"new");
    assert!(!staged.parent().unwrap().exists());

    let staged = stage(&data, "1-2", "a.pdf", b"newer");
    let refused = deliver(
        &data,
        &staged,
        &Target::Path {
            path: to.clone(),
            may_replace: false,
        },
    );
    assert!(refused.unwrap_err().contains("already exists"));
    assert_eq!(std::fs::read(&to).unwrap(), b"new", "untouched");
    assert!(staged.exists(), "kept for another choice");

    deliver(
        &data,
        &staged,
        &Target::Path {
            path: to.clone(),
            may_replace: true,
        },
    )
    .unwrap();
    assert_eq!(
        std::fs::read(&to).unwrap(),
        b"newer",
        "the panel confirmed it"
    );
}

#[test]
fn a_folder_or_link_is_never_replaced() {
    let mac = Scratch::new("download-path-kinds");
    let from = mac.join("staged");
    std::fs::write(&from, b"x").unwrap();
    std::fs::create_dir(mac.join("folder")).unwrap();
    let rename = |a: &Path, b: &Path| std::fs::rename(a, b);
    assert!(move_file(&from, &mac.join("folder"), true, rename).is_err());
    #[cfg(unix)]
    {
        std::fs::write(mac.join("real"), b"mine").unwrap();
        std::os::unix::fs::symlink(mac.join("real"), mac.join("link")).unwrap();
        assert!(move_file(&from, &mac.join("link"), true, rename).is_err());
        assert_eq!(std::fs::read(mac.join("real")).unwrap(), b"mine");
    }
    assert!(from.exists());
}

#[test]
fn across_volumes_it_copies_then_deletes() {
    let mac = Scratch::new("download-exdev");
    let from = mac.join("staged.bin");
    std::fs::write(&from, b"bytes").unwrap();
    let to = mac.join("out.bin");
    let other_volume = |_: &Path, _: &Path| Err(Error::from(ErrorKind::CrossesDevices));
    move_file(&from, &to, false, other_volume).unwrap();
    assert_eq!(std::fs::read(&to).unwrap(), b"bytes");
    assert!(!from.exists(), "the original goes");
    let names: Vec<_> = std::fs::read_dir(&*mac)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, ["out.bin"], "no partial copy left behind");

    std::fs::write(&from, b"bytes").unwrap();
    let denied = |_: &Path, _: &Path| Err(Error::from(ErrorKind::PermissionDenied));
    assert!(move_file(&from, &mac.join("other.bin"), false, denied).is_err());
    assert!(from.exists(), "any other failure keeps the staged file");
}

#[test]
fn only_a_staging_folder_is_ever_removed() {
    let data = Scratch::new("download-remove");
    let outside = data.join("courses").join("X").join("keep.pdf");
    std::fs::create_dir_all(outside.parent().unwrap()).unwrap();
    std::fs::write(&outside, b"keep").unwrap();
    remove_staged(&outside);
    assert!(outside.exists());

    let staged = stage(&data, "1-1", "a.pdf", b"x");
    remove_staged(&staged);
    assert!(!staged.parent().unwrap().exists());
    assert!(data.join("downloads").join(".incoming").exists());
}
