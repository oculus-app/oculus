//! One challenge's workspace resynced from Ed outside a sync: the lesson
//! view's Resync. It holds the sync's claim, so it never writes a folder a
//! sync is writing, and each file is the sync's `scrape-file` event, so the
//! app's listener updates its row. Nothing else a sync emits is sent.

use tauri::{AppHandle, Emitter};

use super::ScrapeClaim;
use crate::sync::{Engine, FileEvent, Mirrored, Reporter, Subject};

/// Fetch Ed challenge `challenge_id`'s workspace now and mirror it into the
/// folder of the slide whose file is `slide_md` (data-dir-relative), in the
/// subject `subject_id` / `subject_code`. Answers what changed, or why
/// nothing did; refused while a sync runs.
#[tauri::command]
pub async fn ed_resync_workspace(
    app: AppHandle,
    subject_id: i64,
    subject_code: String,
    challenge_id: i64,
    slide_title: String,
    slide_md: String,
) -> Result<Mirrored, String> {
    let claim = ScrapeClaim::take()?;
    crate::runtime::blocking::run(move || {
        let _claim = claim;
        let engine = Engine::new(
            &crate::library::paths::data_dir(),
            Box::new(FileEvents(app)),
        );
        let subject = Subject {
            id: subject_id,
            code: subject_code,
        };
        let outcome = engine.resync_workspace(&subject, challenge_id, &slide_title, &slide_md);
        match &outcome {
            Ok(m) => elog!(
                "[oculus] ed workspace {slide_title} resynced: {} new, {} updated, {} removed",
                m.added,
                m.updated,
                m.removed
            ),
            Err(e) => elog!("[oculus] ed workspace {slide_title} not resynced: {e}"),
        }
        outcome
    })
    .await
}

/// Files as the sync's `scrape-file` events; log lines to the app log only.
struct FileEvents(AppHandle);

impl Reporter for FileEvents {
    fn file(&self, f: &FileEvent) {
        elog!("[oculus] {} {}", f.action, f.relative_path);
        self.0.emit("scrape-file", f).ok();
    }

    fn log(&self, level: &str, course: &str, message: &str) {
        elog!("[oculus] {level} {course}: {message}");
    }
}
