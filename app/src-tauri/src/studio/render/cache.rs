//! `<dir>/.cache/`: encoded segments (`segments/<key>.mp4`), mixed
//! narration tracks (`narration-<key>.wav`), the concat lists, and
//! `renders.json`, which records what each preset's last successful render
//! used and wrote. After a render, segments and tracks no preset's last
//! render used are deleted, as are interrupted `.part` files.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::error::RenderError;
use super::preset::Preset;

pub(super) fn root(dir: &Path) -> PathBuf {
    dir.join(".cache")
}

pub(super) fn segments(dir: &Path) -> PathBuf {
    root(dir).join("segments")
}

pub(super) fn segment(dir: &Path, key: &str) -> PathBuf {
    segments(dir).join(format!("{key}.mp4"))
}

pub(super) fn track(dir: &Path, key: &str) -> PathBuf {
    root(dir).join(format!("narration-{key}.wav"))
}

pub(super) fn concat_list(dir: &Path, preset: Preset) -> PathBuf {
    root(dir).join(format!("concat-{}.txt", preset.name()))
}

/// A cache file's name, as `Used` records it.
pub(super) fn file_name(path: &Path) -> Option<String> {
    path.file_name().map(|n| n.to_string_lossy().into_owned())
}

fn record_path(dir: &Path) -> PathBuf {
    root(dir).join("renders.json")
}

/// What one render used, by file name, and what it wrote. Two equal
/// records mean a render now would make the same file.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub(super) struct Used {
    pub segments: Vec<String>,
    pub track: Option<String>,
    /// The file written, as [`recorded_out`] spells it.
    #[serde(default)]
    pub out: Option<String>,
}

/// A render's output as the record keeps it: relative to the video's folder
/// when it is inside it (`final.mp4`), so the record says the same wherever
/// the folder is; a file written elsewhere keeps its absolute path.
pub(super) fn recorded_out(dir: &Path, out: &Path) -> String {
    let inside = out.strip_prefix(dir).unwrap_or(out);
    crate::library::paths::slash_path(inside)
}

/// A record written with the folder's absolute path in it names the same
/// file when that path runs through this folder's own `videos/<slug>/`: what
/// follows is the path inside the video.
fn relative_to_video(dir: &Path, out: &str) -> String {
    let (Some(slug), Some(videos)) = (dir.file_name(), dir.parent().and_then(Path::file_name))
    else {
        return out.to_owned();
    };
    let path = Path::new(out);
    let parts: Vec<&std::ffi::OsStr> = path.iter().collect();
    let inside = parts
        .windows(2)
        .rposition(|pair| pair[0] == videos && pair[1] == slug)
        .map(|at| &parts[at + 2..])
        .filter(|rest| path.is_absolute() && !rest.is_empty());
    match inside {
        Some(rest) => crate::library::paths::slash_path(rest.iter().collect::<PathBuf>()),
        None => out.to_owned(),
    }
}

/// Each preset's last render, by name. An unreadable record counts as
/// empty.
pub(super) fn records(dir: &Path) -> BTreeMap<String, Used> {
    let mut records: BTreeMap<String, Used> = std::fs::read(record_path(dir))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    for used in records.values_mut() {
        used.out = used.out.take().map(|out| relative_to_video(dir, &out));
    }
    records
}

/// Record `used` as `preset`'s last render, then delete every segment and
/// track no preset's record names, and every `.part`; the names deleted,
/// sorted.
pub(super) fn record_and_prune(
    dir: &Path,
    preset: Preset,
    used: Used,
) -> Result<Vec<String>, RenderError> {
    let mut record = records(dir);
    // A preset since removed keeps no segments or track alive.
    record.retain(|name, _| Preset::parse(name).is_ok());
    record.insert(preset.name().to_owned(), used);
    write_and_prune(dir, &record)
}

/// Forget the removed export and release the cache files it alone used.
pub(in crate::studio) fn forget_and_prune(dir: &Path, preset: Preset) -> Result<(), RenderError> {
    let mut record = records(dir);
    if record.remove(preset.name()).is_some() {
        write_and_prune(dir, &record)?;
    } else {
        prune(dir, &record)?;
    }
    Ok(())
}

fn write_and_prune(
    dir: &Path,
    record: &BTreeMap<String, Used>,
) -> Result<Vec<String>, RenderError> {
    let path = record_path(dir);
    crate::runtime::atomic_write::json(&path, &record).map_err(|e| RenderError::io(&path, e))?;
    prune(dir, record)
}

fn prune(dir: &Path, record: &BTreeMap<String, Used>) -> Result<Vec<String>, RenderError> {
    let keep: BTreeSet<&str> = record
        .values()
        .flat_map(|u| u.segments.iter().chain(&u.track))
        .map(String::as_str)
        .collect();
    let mut deleted = Vec::new();
    for (folder, is_ours) in [
        (segments(dir), is_segment as fn(&str) -> bool),
        (root(dir), is_track),
    ] {
        let entries = match std::fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(RenderError::io(&folder, e)),
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let stale = name.ends_with(".part") || (is_ours(&name) && !keep.contains(&*name));
            if stale && entry.path().is_file() {
                std::fs::remove_file(entry.path())
                    .map_err(|e| RenderError::io(&entry.path(), e))?;
                deleted.push(name);
            }
        }
    }
    deleted.sort();
    Ok(deleted)
}

fn is_segment(name: &str) -> bool {
    name.ends_with(".mp4")
}

fn is_track(name: &str) -> bool {
    name.starts_with("narration-") && name.ends_with(".wav")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The record survives its folder moving: a render made when Studio sat
    /// at the data dir's top is still the one a render now would make.
    #[test]
    fn a_record_names_its_output_inside_the_video_not_where_the_video_is() {
        let dir = Path::new("/data/.oculus/studio/videos/bayes");
        assert_eq!(
            recorded_out(dir, &dir.join("renders/final.mp4")),
            "renders/final.mp4"
        );
        assert_eq!(recorded_out(dir, Path::new("/tmp/x.mp4")), "/tmp/x.mp4");

        for (recorded, read) in [
            (
                "/data/studio/videos/bayes/renders/final.mp4",
                "renders/final.mp4",
            ),
            (
                "/elsewhere/studio/videos/bayes/renders/small.mp4",
                "renders/small.mp4",
            ),
            ("renders/final.mp4", "renders/final.mp4"),
            // Another video's file, or one written outside any video.
            (
                "/data/studio/videos/other/renders/final.mp4",
                "/data/studio/videos/other/renders/final.mp4",
            ),
            ("/tmp/bayes/final.mp4", "/tmp/bayes/final.mp4"),
        ] {
            assert_eq!(relative_to_video(dir, recorded), read, "{recorded}");
        }
    }

    #[test]
    fn an_older_record_reads_as_the_same_render() {
        let scratch = crate::test_support::Scratch::new("studio-render-record");
        let dir = scratch.join(".oculus/studio/videos/bayes");
        std::fs::create_dir_all(root(&dir)).unwrap();
        let old = serde_json::json!({"final": {
            "segments": ["a.mp4"], "track": null,
            "out": "/Users/x/Library/Application Support/com.tchan.oculus/studio/videos/bayes/renders/final.mp4",
        }});
        std::fs::write(record_path(&dir), old.to_string()).unwrap();
        let now = Used {
            segments: vec!["a.mp4".into()],
            track: None,
            out: Some(recorded_out(&dir, &Preset::Final.default_out(&dir))),
        };
        assert_eq!(records(&dir).get("final"), Some(&now));
    }
}
