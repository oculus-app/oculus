//! Which files sit loose in `courses/` and where each goes at the top. A
//! file goes with what parsing made of it (`paths::artifact_slots`): its
//! converted PDF and text beside it, its records into the top level's
//! `.oculus/derived/`, all under the one name it lands on.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use super::journal::Plan;
use crate::library::layout::{self, COURSES_DIR};
use crate::library::migrate::journal::{Kind, Op, Step};
use crate::library::migrate::plan::name_key;
use crate::library::migrate::rules::Rule;
use crate::library::paths::{artifact_at, artifact_slots, slash_path, ArtifactSlot};

/// The regular files directly in `courses/`, by name, sorted: never a
/// folder (a subject), a dot-name or a symlink.
fn loose_files(data_dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(layout::courses_dir(data_dir)) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| !n.starts_with('.'))
        .collect();
    names.sort();
    names
}

/// The companions of `courses/<name>` on disk, each with its slot. A folder
/// (a PDF's pictures) is not moved: it is reported instead.
fn companions(data_dir: &Path, name: &str) -> Vec<(ArtifactSlot, String)> {
    let rel = format!("{COURSES_DIR}/{name}");
    artifact_slots(data_dir, &rel)
        .into_iter()
        .filter(|(_, path)| std::fs::symlink_metadata(path).is_ok())
        .filter_map(|(slot, path)| Some((slot, slash_path(path.strip_prefix(data_dir).ok()?))))
        .collect()
}

pub fn build(data_dir: &Path) -> Plan {
    let mut plan = Plan::default();
    let loose = loose_files(data_dir);
    let all: BTreeMap<&str, Vec<(ArtifactSlot, String)>> = loose
        .iter()
        .map(|name| (name.as_str(), companions(data_dir, name)))
        .collect();
    // A file another loose file makes (its PDF, its text) goes with it.
    let claimed: BTreeSet<String> = all.values().flatten().map(|(_, rel)| rel.clone()).collect();
    let mut taken = BTreeSet::new();
    for (name, companions) in &all {
        let rel = format!("{COURSES_DIR}/{name}");
        if claimed.contains(&rel) {
            continue;
        }
        let new = {
            let free = |candidate: &str| {
                let targets = std::iter::once(candidate.to_string()).chain(
                    companions
                        .iter()
                        .filter_map(|(slot, _)| artifact_at(data_dir, candidate, *slot))
                        .filter_map(|p| Some(slash_path(p.strip_prefix(data_dir).ok()?))),
                );
                targets.into_iter().all(|t| {
                    !taken.contains(&name_key(&t))
                        && !layout::reserved_top_name(&t)
                        && std::fs::symlink_metadata(data_dir.join(&t)).is_err()
                })
            };
            crate::library::drive::ops::names::free_name_where(name, false, free)
        };
        let mut moves = vec![(rel, new.clone())];
        for (slot, from) in companions {
            let is_file = std::fs::symlink_metadata(data_dir.join(from)).is_ok_and(|m| m.is_file());
            match artifact_at(data_dir, &new, *slot) {
                Some(to) if is_file => {
                    moves.push((from.clone(), slash_path(to.strip_prefix(data_dir).unwrap())))
                }
                _ => plan.left.push(format!(
                    "{from}, which is not a file, stays beside {name}'s old place"
                )),
            }
        }
        for (from, to) in moves {
            taken.insert(name_key(&to));
            if !to.starts_with('.') {
                plan.rules.push(Rule {
                    old: from.clone(),
                    new: to.clone(),
                });
            }
            plan.steps.push(Step {
                kind: Kind::Loose,
                op: Op::Rename { from, to },
                done: false,
            });
        }
    }
    plan
}
