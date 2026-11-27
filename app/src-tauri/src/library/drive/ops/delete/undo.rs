//! Undo: each entry back out of the Trash to where it was, its rows and
//! records untouched. Folders on the way that are gone are made again; a
//! place something else took meanwhile gives Drive's next free name, its
//! records and rows following as a rename's do (`moves::carry_out`).

use std::path::Path;

use sqlx::SqlitePool;

use super::super::companions::companions;
use super::super::error::{shown, DriveError, DriveResult};
use super::super::guard::{keeps_name, parent_rel, through_symlink, Entry};
use super::super::moves::{blocking, carry_out, Plan};
use super::super::names::free_name_where;
use super::{finish, take, Item, Pending};
use crate::library::layout::{self, Home};

/// Undo the pending delete `handle`; returns where each entry is now. One
/// gone from the Trash meanwhile is final instead, and the first such is the
/// error once the rest are back.
pub async fn undo_at(pool: &SqlitePool, handle: u64) -> DriveResult<Vec<String>> {
    let Some(pending) = take(handle) else {
        return Err(DriveError::not_found("That delete"));
    };
    let data_dir = pending.data_dir.clone();
    let mut back = Vec::new();
    let mut lost = Vec::new();
    let mut failed = None;
    for item in pending.items {
        match restore(&data_dir, pool, &item).await {
            Ok(rel) => back.push(rel),
            Err(e) => {
                failed.get_or_insert(e);
                lost.push(item);
            }
        }
    }
    if !lost.is_empty() {
        let rest = Pending {
            id: handle,
            data_dir,
            items: lost,
        };
        finish::finish(pool, rest).await?;
    }
    match failed {
        Some(e) => Err(e),
        None => Ok(back),
    }
}

async fn restore(data_dir: &Path, pool: &SqlitePool, item: &Item) -> DriveResult<String> {
    if std::fs::symlink_metadata(&item.trashed).is_err() {
        return Err(DriveError::not_found(&format!(
            "{} in the {}",
            shown(&item.rel),
            crate::runtime::trash::BIN
        )));
    }
    let parent = parent_rel(&item.rel);
    make_parent(data_dir, parent)?;
    if std::fs::symlink_metadata(&item.path).is_err() {
        let (from, to) = (item.trashed.clone(), item.path.clone());
        blocking(move || std::fs::rename(&from, &to).map_err(DriveError::from)).await?;
        return Ok(item.rel.clone());
    }
    let name = free_name(data_dir, parent, &item.rel, item.dir);
    let to = layout::child_rel(parent, &name);
    let plan = Plan {
        entry: Entry {
            rel: item.rel.clone(),
            path: item.trashed.clone(),
            dir: item.dir,
        },
        to: to.clone(),
    };
    carry_out(data_dir, pool, vec![plan], None).await?;
    Ok(to)
}

/// The folder an entry goes back into, made again when gone: only a folder
/// of the student's, below a home whose own folder is still there.
fn make_parent(data_dir: &Path, parent: &str) -> DriveResult<()> {
    let own = layout::is_home_root(parent) || layout::own_path_ok(parent);
    let root = match layout::home_of(parent) {
        Some(Home::Subject(folder)) => format!("{}/{folder}", layout::COURSES_DIR),
        Some(Home::TopLevel) => String::new(),
        None => return Err(DriveError::read_only(parent)),
    };
    if !own || through_symlink(data_dir, parent) {
        return Err(DriveError::read_only(parent));
    }
    if !data_dir.join(&root).is_dir() {
        return Err(DriveError::not_found(&root));
    }
    std::fs::create_dir_all(data_dir.join(parent)).map_err(DriveError::from)
}

/// The entry's name in `parent`, else Drive's next free one, for it and,
/// for a file, everything that lands beside it.
fn free_name(data_dir: &Path, parent: &str, rel: &str, dir: bool) -> String {
    let free = |path: &Path| std::fs::symlink_metadata(path).is_err();
    free_name_where(shown(rel), dir, |candidate| {
        let to = layout::child_rel(parent, candidate);
        !keeps_name(parent, candidate)
            && free(&data_dir.join(&to))
            && (dir
                || companions(data_dir, rel, &to)
                    .iter()
                    .filter(|c| !c.hidden)
                    .all(|c| c.to.as_deref().is_none_or(free)))
    })
}
