//! Exports on a scratch data folder with a migrated database: a video folder
//! whose `renders/` holds stand-in files, never a real render.

use std::path::{Path, PathBuf};

use sqlx::sqlite::SqlitePoolOptions;
use sqlx::SqlitePool;

use super::*;
use crate::library::drive::ops::rows::{apply_moves, delete_rows, RowMove};
use crate::library::files::uploads::ImportedFile;
use crate::test_support::Scratch;

const CODE: &str = "MULT20015_2026_SM2";
const SLUG: &str = "rsa-one-way";
const TITLE: &str = "Easy to multiply, hard to undo";

struct Lib {
    dir: Scratch,
    pool: SqlitePool,
}

impl Lib {
    async fn new(name: &str) -> Self {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for migration in crate::db::migrations::all() {
            sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO subjects (id, code, name) VALUES (1, ?1, ?1)")
            .bind(CODE)
            .execute(&pool)
            .await
            .unwrap();
        let dir = Scratch::new(name);
        std::fs::create_dir_all(dir.join(layout::course_rel(CODE))).unwrap();
        Self { dir, pool }
    }

    /// A video folder under the state folder, with `subject`, whose last
    /// render wrote `bytes` (and captions when `captions`).
    fn video(&self, subject: Option<&str>, bytes: &str, captions: bool) -> (PathBuf, Report) {
        let dir = self.dir.join(".oculus/studio/videos").join(SLUG);
        std::fs::create_dir_all(dir.join("renders")).unwrap();
        let mut json = serde_json::json!({
            "title": TITLE, "size": { "width": 2, "height": 2 }, "theme": "default",
            "scenes": [{ "component": "TitleCard", "props": { "title": "RSA" }, "hold": 1 }],
        });
        if let Some(code) = subject {
            json["subject"] = serde_json::json!(code);
        }
        std::fs::write(dir.join("video.json"), json.to_string()).unwrap();
        (
            dir.clone(),
            self.rendered(&dir, Preset::Final, bytes, captions),
        )
    }

    fn rendered(&self, dir: &Path, preset: Preset, bytes: &str, captions: bool) -> Report {
        let mp4 = preset.default_out(dir);
        std::fs::write(&mp4, bytes).unwrap();
        let vtt = mp4.with_extension("vtt");
        if captions {
            std::fs::write(&vtt, format!("WEBVTT\n\n{bytes}")).unwrap();
        } else {
            let _ = std::fs::remove_file(&vtt);
        }
        Report {
            path: mp4,
            preset,
            width: 2,
            height: 2,
            fps: 30,
            frames: 30,
            duration: 1.0,
            audio: captions,
            threads: 1,
            segments: Vec::new(),
            sidecars: captions.then_some(vtt).into_iter().collect(),
            pruned: Vec::new(),
            ms: 0,
        }
    }

    fn read(&self, rel: &str) -> String {
        std::fs::read_to_string(self.dir.join(rel)).unwrap()
    }

    fn exists(&self, rel: &str) -> bool {
        self.dir.join(rel).exists()
    }

    async fn rows(&self) -> Vec<(i64, i64, String, String, String, i64)> {
        sqlx::query_as(
            "SELECT id, subject_id, relative_path, file_type, category, size_bytes
             FROM files ORDER BY relative_path",
        )
        .fetch_all(&self.pool)
        .await
        .unwrap()
    }

    async fn export(&self, dir: &Path, report: &Report, to: Option<(&str, &str)>) -> Exported {
        let to = to.map(|(target_dir, name)| Destination {
            target_dir: target_dir.into(),
            name: name.into(),
        });
        to_drive(&self.dir, &self.pool, dir, report, to)
            .await
            .unwrap()
    }
}

fn videos_in(code: &str) -> String {
    format!("{}/Videos", layout::course_rel(code))
}

#[tokio::test]
async fn the_suggestion_is_videos_in_the_subject_or_at_the_top_level() {
    let lib = Lib::new("export-suggest").await;
    let (dir, _) = lib.video(Some(CODE), "x", false);
    let final_ = suggestion(&lib.pool, &dir, Preset::Final).await.unwrap();
    assert_eq!(final_.target_dir, videos_in(CODE));
    assert_eq!(final_.name, format!("{TITLE}.mp4"));
    let small = suggestion(&lib.pool, &dir, Preset::Small).await.unwrap();
    assert_eq!(small.name, format!("{TITLE} (small).mp4"));

    let (dir, _) = lib.video(None, "x", false);
    assert_eq!(
        suggestion(&lib.pool, &dir, Preset::Final)
            .await
            .unwrap()
            .target_dir,
        "Videos"
    );
    // A subject Oculus has no row for is no home: the top level.
    let (dir, _) = lib.video(Some("UNKNOWN_2026"), "x", false);
    assert_eq!(
        suggestion(&lib.pool, &dir, Preset::Final)
            .await
            .unwrap()
            .target_dir,
        "Videos"
    );
}

#[tokio::test]
async fn a_first_export_lands_where_chosen_with_rows_like_an_import_and_a_link() {
    let lib = Lib::new("export-first").await;
    let (dir, report) = lib.video(Some(CODE), "frames v1", true);
    let target = layout::course_rel(CODE);
    std::fs::create_dir(lib.dir.join(&target).join("Exam prep")).unwrap();
    let to = format!("{target}/Exam prep");
    let done = lib
        .export(&dir, &report, Some((&to, "RSA in a minute.mp4")))
        .await;

    let rel = format!("{to}/RSA in a minute.mp4");
    assert_eq!(done.file.rel, rel);
    assert!(!done.replaced);
    assert_eq!(lib.read(&rel), "frames v1");
    assert_eq!(lib.read(&format!("{rel}.vtt")), "WEBVTT\n\nframes v1");
    // renders/ keeps Studio's own copy.
    assert!(dir.join("renders/final.mp4").is_file());

    let rows = lib.rows().await;
    assert_eq!(rows.len(), 2, "{rows:?}");
    for (_, subject, path, kind, category, size) in &rows {
        let imported = ImportedFile::new(path.clone(), kind, 0);
        assert_eq!(*subject, 1);
        assert_eq!(category, &imported.category);
        assert_eq!(
            *size as u64,
            std::fs::metadata(lib.dir.join(path)).unwrap().len()
        );
    }
    assert_eq!(rows[0].2, rel);
    assert_eq!(rows[0].3, "mp4");
    assert_eq!(rows[1].3, "vtt");
    assert_eq!(
        drive_file(&lib.dir, &lib.pool, SLUG, Preset::Final)
            .await
            .unwrap(),
        Some(done.file.clone())
    );
    assert_eq!(done.change.subject_ids, vec![1]);
    assert_eq!(done.change.added, vec![rel.clone(), format!("{rel}.vtt")]);
}

#[tokio::test]
async fn a_taken_name_steps_aside_and_the_name_always_ends_in_mp4() {
    let lib = Lib::new("export-free").await;
    let (dir, report) = lib.video(Some(CODE), "new", false);
    let to = layout::course_rel(CODE);
    std::fs::write(lib.dir.join(&to).join("Talk.mp4"), "mine").unwrap();
    let done = lib.export(&dir, &report, Some((&to, "Talk"))).await;
    assert_eq!(done.file.rel, format!("{to}/Talk (2).mp4"));
    assert_eq!(lib.read(&format!("{to}/Talk.mp4")), "mine");
}

#[tokio::test]
async fn a_re_render_replaces_the_file_where_the_student_moved_and_renamed_it() {
    let lib = Lib::new("export-moved").await;
    let (dir, report) = lib.video(Some(CODE), "v1", true);
    let first = lib.export(&dir, &report, None).await;
    let made = format!("{}/{TITLE}.mp4", videos_in(CODE));
    assert_eq!(first.file.rel, made);

    // Drive's move: the disk, then the row by id.
    let moved = format!("{}/Week 12/RSA in a minute.mp4", layout::course_rel(CODE));
    std::fs::create_dir_all(lib.dir.join(&moved).parent().unwrap()).unwrap();
    std::fs::rename(lib.dir.join(&made), lib.dir.join(&moved)).unwrap();
    let row_move = RowMove {
        from: made.clone(),
        to: moved.clone(),
        dir: false,
        relink: None,
        drop_parse: false,
    };
    apply_moves(&lib.pool, &[row_move], None).await.unwrap();

    // A player holding the old file keeps reading it.
    let mut open = std::fs::File::open(lib.dir.join(&moved)).unwrap();
    let report = lib.rendered(&dir, Preset::Final, "v2", true);
    let again = lib.export(&dir, &report, None).await;
    assert!(again.replaced);
    assert_eq!(
        again.file,
        DriveFile {
            file_id: first.file.file_id,
            rel: moved.clone()
        }
    );
    assert_eq!(lib.read(&moved), "v2");
    assert_eq!(lib.read(&format!("{moved}.vtt")), "WEBVTT\n\nv2");
    let mut old = String::new();
    std::io::Read::read_to_string(&mut open, &mut old).unwrap();
    assert_eq!(old, "v1");
    assert!(!lib.exists(&made), "nothing new at the old place");

    let rows = lib.rows().await;
    let mp4 = rows.iter().find(|r| r.2 == moved).unwrap();
    assert_eq!(mp4.0, first.file.file_id);
    assert_eq!(mp4.5, 2);
    // No hidden temporary file is left beside it.
    let leftovers: Vec<_> = std::fs::read_dir(lib.dir.join(&moved).parent().unwrap())
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with('.'))
        .collect();
    assert!(leftovers.is_empty());
}

#[tokio::test]
async fn a_re_render_without_narration_removes_the_captions_beside_it() {
    let lib = Lib::new("export-uncaptioned").await;
    let (dir, report) = lib.video(None, "v1", true);
    let first = lib.export(&dir, &report, None).await;
    assert_eq!(first.file.rel, format!("Videos/{TITLE}.mp4"));
    let vtt = format!("{}.vtt", first.file.rel);
    assert!(lib.exists(&vtt));

    let report = lib.rendered(&dir, Preset::Final, "v2", false);
    let again = lib.export(&dir, &report, None).await;
    assert_eq!(again.captions, None);
    assert!(!lib.exists(&vtt));
    assert_eq!(again.change.removed, vec![vtt.clone()]);
    assert!(lib.rows().await.iter().all(|r| r.2 != vtt));
}

#[tokio::test]
async fn a_file_deleted_in_drive_is_no_link_so_the_next_render_asks_again() {
    let lib = Lib::new("export-deleted").await;
    let (dir, report) = lib.video(Some(CODE), "v1", false);
    let first = lib.export(&dir, &report, None).await;

    // Drive's delete removes the row with its children explicitly.
    std::fs::remove_file(lib.dir.join(&first.file.rel)).unwrap();
    delete_rows(&lib.pool, &[(first.file.rel.clone(), false)])
        .await
        .unwrap();
    assert_eq!(
        drive_file(&lib.dir, &lib.pool, SLUG, Preset::Final)
            .await
            .unwrap(),
        None
    );
    let links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM studio_exports")
        .fetch_one(&lib.pool)
        .await
        .unwrap();
    assert_eq!(links, 0);

    // With no link and no destination (the CLI), the suggested folder again.
    let again = lib.export(&dir, &report, None).await;
    assert!(!again.replaced);
    assert_ne!(again.file.file_id, first.file.file_id);
}

#[tokio::test]
async fn deleting_the_files_row_cascades_to_the_link() {
    let lib = Lib::new("export-cascade").await;
    let (dir, report) = lib.video(Some(CODE), "v1", false);
    let first = lib.export(&dir, &report, None).await;
    sqlx::query("DELETE FROM files WHERE id = ?1")
        .bind(first.file.file_id)
        .execute(&lib.pool)
        .await
        .unwrap();
    let links: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM studio_exports")
        .fetch_one(&lib.pool)
        .await
        .unwrap();
    assert_eq!(links, 0, "sqlx connections have foreign_keys on");
}

#[tokio::test]
async fn a_file_gone_from_disk_counts_as_no_link() {
    let lib = Lib::new("export-gone").await;
    let (dir, report) = lib.video(Some(CODE), "v1", false);
    let first = lib.export(&dir, &report, None).await;
    std::fs::remove_file(lib.dir.join(&first.file.rel)).unwrap();
    assert_eq!(
        drive_file(&lib.dir, &lib.pool, SLUG, Preset::Final)
            .await
            .unwrap(),
        None
    );
}

#[tokio::test]
async fn a_chosen_destination_moves_the_link_and_leaves_the_old_file() {
    let lib = Lib::new("export-elsewhere").await;
    let (dir, report) = lib.video(Some(CODE), "v1", false);
    let first = lib.export(&dir, &report, None).await;
    let to = layout::course_rel(CODE);
    let second = lib.export(&dir, &report, Some((&to, "Copy.mp4"))).await;
    assert!(lib.exists(&first.file.rel));
    assert_eq!(
        drive_file(&lib.dir, &lib.pool, SLUG, Preset::Final)
            .await
            .unwrap(),
        Some(second.file)
    );
}

#[tokio::test]
async fn final_and_small_link_separately_and_draft_never_exports() {
    let lib = Lib::new("export-presets").await;
    let (dir, report) = lib.video(Some(CODE), "big", false);
    lib.export(&dir, &report, None).await;
    let small = lib.rendered(&dir, Preset::Small, "little", false);
    let done = lib.export(&dir, &small, None).await;
    assert_eq!(
        done.file.rel,
        format!("{}/{TITLE} (small).mp4", videos_in(CODE))
    );
    assert_eq!(
        drive_files(&lib.dir, &lib.pool, SLUG).await.unwrap().len(),
        2
    );
    assert!(!exports(Preset::Draft));
    assert!(exports(Preset::Final) && exports(Preset::Small));
}

#[tokio::test]
async fn a_destination_outside_the_students_folders_is_refused_and_nothing_is_written() {
    let lib = Lib::new("export-refused").await;
    let (dir, report) = lib.video(Some(CODE), "v1", false);
    let course = format!("{}/Course", layout::course_rel(CODE));
    std::fs::create_dir_all(lib.dir.join(&course)).unwrap();
    for target in [course.as_str(), ".oculus", "courses"] {
        let to = Destination {
            target_dir: target.into(),
            name: "x.mp4".into(),
        };
        assert!(to_drive(&lib.dir, &lib.pool, &dir, &report, Some(to))
            .await
            .is_err());
    }
    assert!(lib.rows().await.is_empty());
}

#[test]
fn make_folder_makes_each_missing_level_and_refuses_the_apps_and_synced_names() {
    let dir = Scratch::new("export-make-folder");
    std::fs::create_dir_all(dir.join(layout::course_rel(CODE)).join("Course")).unwrap();
    make_folder(&dir, "Videos/Shorts/Week 1").unwrap();
    assert!(dir.join("Videos/Shorts/Week 1").is_dir());
    make_folder(&dir, "Videos/Shorts").unwrap();
    let synced = format!("{}/Course/Mine", layout::course_rel(CODE));
    for refused in [".oculus/x", "courses", synced.as_str(), "a/../b"] {
        assert!(make_folder(&dir, refused).is_err(), "{refused}");
    }
}
