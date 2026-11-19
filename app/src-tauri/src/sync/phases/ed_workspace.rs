//! A challenge slide's workspace folder, `<NN>-<slide-slug>/` beside the slide
//! file: a read-only mirror of the student's workspace on Ed, fetched every
//! sync and by the slide's Resync. Ed's files are written at Ed's own paths
//! and everything else in the folder is deleted, but only once a download has
//! come in and unpacked.

use crate::library::layout::{self, SyncedKind};
use crate::library::paths;
use crate::sources::ed::workspace::{self, Keep, Pruned};
use crate::sources::ed::{self, SlideExtras};
use crate::sync::{Engine, FileEvent, Subject};

/// Data-dir folder of per-challenge records, `<challenge_id>.json`, each
/// marking a workspace whose folder may hold local edits. The mirror
/// replaces them, so a run counts them for one log line, then deletes it.
pub(in crate::sync) const EDIT_RECORDS: &str = "ed-workspaces";

/// What one mirror did to a challenge's folder: Ed's files written new,
/// rewritten or left as they were, and the files Ed lacks deleted.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct Mirrored {
    pub added: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub removed: usize,
}

impl Engine {
    /// The slide's workspace for the sync's lessons phase: a fetch that
    /// fails becomes a note in the slide's file.
    pub(super) fn lesson_workspace(
        &self,
        c: &Subject,
        challenge_id: i64,
        slide_title: &str,
        slide_stem: &str,
    ) -> SlideExtras {
        match self.fetch_workspace(c, challenge_id, slide_title, slide_stem) {
            Ok(_) => SlideExtras::default(),
            Err(_) => SlideExtras {
                note: Some("The challenge's files could not be fetched.".into()),
                ..SlideExtras::default()
            },
        }
    }

    /// One challenge's workspace resynced outside a sync (the slide's
    /// Resync); `slide_md` is the slide file's data-dir-relative path. The
    /// Ed course is resolved first, as the sync's Ed phase does, which
    /// renews the token or mints a new one through Canvas.
    pub fn resync_workspace(
        &self,
        c: &Subject,
        challenge_id: i64,
        slide_title: &str,
        slide_md: &str,
    ) -> Result<Mirrored, String> {
        let stem = slide_stem_of(&c.code, slide_md)?;
        match self.ed.resolve_course(&self.canvas, c.id, &c.code)? {
            Some(_) => self.fetch_workspace(c, challenge_id, slide_title, &stem),
            None => Err("This subject has no Ed course on Canvas.".into()),
        }
    }

    /// The student's current workspace for a challenge, mirrored into the
    /// slide's folder. Fetched each time: Ed gives no version for a
    /// workspace, and the byte compare keeps unchanged files unchanged.
    fn fetch_workspace(
        &self,
        c: &Subject,
        challenge_id: i64,
        slide_title: &str,
        slide_stem: &str,
    ) -> Result<Mirrored, String> {
        // `fetch_bytes` names neither the URL nor the ticket in its errors.
        let zip = self
            .ed
            .workspace_zip(challenge_id, ed::open_live_workspace, |url| {
                self.fetch_bytes(url)
            });
        let records = self.data_dir.join(EDIT_RECORDS);
        let had_edits = records.join(format!("{challenge_id}.json")).is_file();
        self.mirror_workspace(c, slide_title, slide_stem, zip, had_edits)
    }

    /// Make the slide's folder hold exactly the files of Ed's `zip`: the
    /// rest deleted, then each of Ed's written. A failed download or a zip
    /// that will not unpack leaves the folder as it is: a `warning`, and the
    /// error. `had_edits` counts what this replaced towards the run's line
    /// about local edits.
    pub(super) fn mirror_workspace(
        &self,
        c: &Subject,
        slide_title: &str,
        slide_stem: &str,
        zip: Result<Vec<u8>, String>,
        had_edits: bool,
    ) -> Result<Mirrored, String> {
        let say = |level: &str, line: &str| {
            self.reporter.log(
                level,
                &c.code,
                &format!("ed workspace {slide_title}: {line}"),
            )
        };
        let failed = |e: String| {
            say("warning", &e);
            Err(e)
        };
        let (files, skipped) = match zip.and_then(|zip| ed::unpack_workspace(&zip)) {
            Ok(unpacked) => unpacked,
            Err(e) => return failed(e),
        };
        let Some(dir) = paths::course_rel_path(&c.code, slide_stem) else {
            return failed(format!("invalid path: {slide_stem}"));
        };
        for line in &skipped {
            say("info", &line.to_string());
        }
        if files.is_empty() && skipped.is_empty() {
            say("info", "Ed's workspace is empty, so its folder is too");
        }

        // A file left out of the zip's unpack is still Ed's, so it stays.
        let ed_paths = files
            .iter()
            .map(|f| f.path.as_str())
            .chain(skipped.iter().map(|s| s.path.as_str()));
        let pruned = self.prune_workspace(&dir, ed_paths);
        for (path, e) in &pruned.failed {
            say("warning", &format!("{path}: could not delete it: {e}"));
        }
        for path in &pruned.removed {
            say("info", &format!("{path} deleted: Ed's workspace has none"));
            let rel = format!("{dir}/{path}");
            self.reporter.file(&FileEvent {
                subject_id: c.id,
                code: c.code.clone(),
                category: layout::category_of(&rel).to_string(),
                relative_path: rel,
                size_bytes: 0,
                canvas_id: None,
                source_url: None,
                source_dates: Default::default(),
                action: "removed",
            });
        }
        let mut replaced = pruned.removed.iter().filter(|p| is_edit(p)).count();
        let mut mirrored = Mirrored {
            removed: pruned.removed.len(),
            ..Mirrored::default()
        };

        for f in files {
            match self.store_workspace_file(c, &dir, &f.path, &f.bytes) {
                Ok(paths::WriteAction::New) => mirrored.added += 1,
                Ok(paths::WriteAction::Updated) => {
                    mirrored.updated += 1;
                    replaced += 1;
                }
                Ok(paths::WriteAction::Unchanged) => mirrored.unchanged += 1,
                Err(e) => say("warning", &format!("{}: {e}", f.path)),
            }
        }
        if had_edits {
            self.replaced_edits
                .set(self.replaced_edits.get() + replaced);
        }
        Ok(mirrored)
    }

    /// `workspace::prune` over the slide's folder `dir` (data-dir-relative),
    /// keeping Ed's files and the parse artifacts each carries. A deleted
    /// file's artifacts go with it, those outside the folder too.
    fn prune_workspace<'a>(&self, dir: &str, ed_paths: impl Iterator<Item = &'a str>) -> Pruned {
        let mut keep = Keep::default();
        for path in ed_paths {
            let rel = format!("{dir}/{path}");
            keep.prefixes
                .extend(paths::parse_artifacts(&self.data_dir, &rel));
            keep.files.insert(self.data_dir.join(rel));
        }
        let pruned = workspace::prune(&self.data_dir.join(dir), &keep);
        for path in &pruned.removed {
            for artifact in paths::parse_artifacts(&self.data_dir, &format!("{dir}/{path}")) {
                if !keep.holds(&artifact) {
                    let _ = if artifact.is_dir() {
                        std::fs::remove_dir_all(&artifact)
                    } else {
                        std::fs::remove_file(&artifact)
                    };
                }
            }
        }
        pruned
    }

    /// Store one workspace file at Ed's own path under the slide's folder
    /// `dir`, through the workspace guard (`workspace::resolve`). Returns
    /// what the write did.
    fn store_workspace_file(
        &self,
        c: &Subject,
        dir: &str,
        path: &str,
        bytes: &[u8],
    ) -> Result<paths::WriteAction, String> {
        let root = self.data_dir.join(dir);
        std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let target = workspace::resolve(&root, path)?;
        let action = match std::fs::read(&target) {
            Ok(existing) if existing == bytes => paths::WriteAction::Unchanged,
            Ok(_) => paths::WriteAction::Updated,
            Err(_) => paths::WriteAction::New,
        };
        if action != paths::WriteAction::Unchanged {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(&target, bytes).map_err(|e| e.to_string())?;
        }
        let rel = format!("{dir}/{path}");
        if action == paths::WriteAction::Updated {
            paths::purge_parse_artifacts(&self.data_dir, &rel);
        }
        self.reporter.file(&FileEvent {
            subject_id: c.id,
            code: c.code.clone(),
            relative_path: rel.clone(),
            size_bytes: bytes.len() as u64,
            category: layout::category_of(&rel).to_string(),
            canvas_id: None,
            source_url: None,
            source_dates: Default::default(),
            action: action.as_str(),
        });
        if self.parse_pdfs && paths::is_pdf(&rel) {
            self.trigger_parse(&rel, c.id);
        }
        Ok(action)
    }

    /// Once a run has mirrored the lessons, say how many local edits it
    /// replaced and delete the edit records (`EDIT_RECORDS`).
    pub(in crate::sync) fn forget_edit_records(&self) {
        let records = self.data_dir.join(EDIT_RECORDS);
        if !self.options.ed_lessons || !records.is_dir() {
            return;
        }
        let n = self.replaced_edits.get();
        if n > 0 {
            let edits = if n == 1 { "edit was" } else { "edits were" };
            self.reporter.log(
                "info",
                "",
                &format!("{n} local {edits} replaced by Ed's copy: challenge files now mirror Ed"),
            );
        }
        if let Err(e) = std::fs::remove_dir_all(&records) {
            elog!("[oculus] {}: could not delete: {e}", records.display());
        }
    }
}

/// The stem the sync mirrors a slide's challenge under (subject-relative, as
/// `ed_lessons::slide_stem` builds it) from the slide file's data-dir-relative
/// path. The mirror deletes what Ed lacks, so only a sanitised slide file two
/// levels inside the subject's lessons folder is taken.
pub(in crate::sync) fn slide_stem_of(code: &str, slide_md: &str) -> Result<String, String> {
    let lessons = format!("{}/", layout::synced_dir(SyncedKind::Lessons));
    slide_md
        .strip_prefix(&layout::in_course(code, ""))
        .and_then(ed::slide_workspace_dir)
        .filter(|stem| paths::safe_rel_path(stem).as_deref() == Some(*stem))
        .filter(|stem| {
            stem.strip_prefix(&lessons)
                .is_some_and(|slide| slide.split('/').count() == 2)
        })
        .map(str::to_string)
        .ok_or_else(|| format!("{slide_md} is not a lesson slide of {code}"))
}

/// Whether a deleted workspace file could have been the student's edit: not
/// a hidden file and not a conflict copy (`<stem>.ed-server.<ext>`).
fn is_edit(path: &str) -> bool {
    !path.split('/').any(|p| p.starts_with('.')) && !path.contains(".ed-server")
}
