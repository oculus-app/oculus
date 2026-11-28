use crate::library::drive::ops::names::{check_name, entry_name, free_name};
use crate::library::drive::ops::relink::{relink_text, shifted};

#[test]
fn picked_names_are_kept_readable_and_safe() {
    assert_eq!(entry_name("Week 1 (notes).pdf"), "Week 1 (notes).pdf");
    assert_eq!(entry_name(".hidden"), "hidden");
    assert_eq!(entry_name("a:b/c"), "a_b_c");
    assert_eq!(entry_name("trailing. "), "trailing");
    assert_eq!(entry_name("CON.txt"), "_CON.txt");
    assert_eq!(entry_name(""), "file");
    assert!(check_name(&entry_name("..."), "courses/X/Notes").is_ok());
}

#[test]
fn a_reserved_name_is_refused_only_at_a_subject_s_root() {
    assert!(check_name("course", "courses/X").is_err());
    assert!(check_name("Course", "courses/X/Notes").is_ok());
    assert!(check_name(".oculus", "courses/X/Notes").is_err());
}

#[test]
fn the_top_level_keeps_the_folder_of_subjects_and_the_old_app_folder_names() {
    for name in ["courses", "Courses", "agents", "Lectures", "canvas-pages"] {
        assert!(check_name(name, "").is_err(), "{name}");
    }
    for name in ["Course", "Videos", "agents 2", "models"] {
        assert!(check_name(name, "").is_ok(), "{name}");
    }
    assert!(check_name("agents", "Videos").is_ok());
    assert!(check_name("courses", "Videos").is_ok());
    assert!(check_name("courses", "courses/X").is_ok());
    assert!(
        check_name(".oculus", "").is_err(),
        "a dot-name is the app's"
    );
}

#[test]
fn a_folder_s_free_name_has_no_extension_split() {
    let dir = crate::test_support::Scratch::new("drive-free-folder");
    std::fs::create_dir(dir.join("v1.2")).unwrap();
    assert_eq!(free_name(&dir, "v1.2", true, |_| false), "v1.2 (2)");
    assert_eq!(free_name(&dir, "v1.2", false, |_| false), "v1 (2).2");
}

#[test]
fn relinking_shifts_offsets_after_each_link_in_utf16() {
    let (text, shifts) = relink_text(
        "é ![](a_images/x) ![](a_images/y)",
        "a_images",
        "bbb_images",
    );
    assert_eq!(text, "é ![](bbb_images/x) ![](bbb_images/y)");
    assert_eq!(shifts, [(4, 2), (20, 2)]);
    assert_eq!(shifted(4, &shifts), 4);
    assert_eq!(shifted(5, &shifts), 7);
    assert_eq!(shifted(30, &shifts), 34);
}
