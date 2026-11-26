//! Subagents: a chat hands a piece of work to a child chat, a thread of its
//! own whose `parent_thread_id` names the chat it came from. [`start`] sends
//! the brief as the child's first message through the one command path and
//! returns the child's thread at once; [`wait`] returns that first run's
//! report once it settles; [`stop`] stops it. The child has the parent's
//! subject and permission mode, its own session, and any agent and model.
//! Children are one level deep: a child cannot start one (docs/harness.md,
//! "Subagents are child chats").

mod brief;
mod report;
mod waiters;

#[cfg(test)]
mod tests;

pub use brief::{Brief, ONE_LEVEL};
pub use report::{Report, Status};
pub use waiters::Waiters;

pub(in crate::harness) use brief::command;
use report::first_run;
#[cfg(test)]
pub(in crate::harness) use report::{report, NO_REPORT};
pub(in crate::harness) use waiters::wait_on;

use crate::harness::core::{Command, Kind};

use super::HarnessState;

/// Start a child of `brief.parent` and return its thread once the brief is
/// saved; the run goes out after. `command_id` is the caller's id for this
/// start: the same one again starts nothing and returns the same child.
/// Refused, with a sentence fit to show, when the parent is itself a child.
pub async fn start(state: &HarnessState, command_id: &str, brief: Brief) -> Result<i64, String> {
    let pool = crate::db::store::open_pool().await?;
    let command = command(&pool, command_id, brief).await?;
    Ok(state.command(command).await?.thread_id)
}

/// The report of `child`'s first run, once it has settled: at once for one
/// already over, after startup's repair, which closes as interrupted a run a
/// quit left open. Later runs of the child never report.
pub async fn wait(state: &HarnessState, child: i64) -> Result<Report, String> {
    state.ready().await?;
    let pool = crate::db::store::open_pool().await?;
    wait_on(&pool, &state.children, child).await
}

/// Stop `child`'s first run; its [`wait`] then reports `interrupted`. A run
/// that is already over, or a child that is gone, is left alone.
pub async fn stop(state: &HarnessState, command_id: &str, child: i64) -> Result<(), String> {
    let pool = crate::db::store::open_pool().await?;
    match stop_command(&pool, command_id, child).await? {
        Some(stop) => state.command(stop).await.map(|_| ()),
        None => Ok(()),
    }
}

/// The `Stop` that names `child`'s first run; `None` when it has none.
pub(in crate::harness) async fn stop_command(
    pool: &sqlx::SqlitePool,
    command_id: &str,
    child: i64,
) -> Result<Option<Command>, String> {
    Ok(first_run(pool, child).await?.map(|run_id| Command {
        id: command_id.to_string(),
        thread_id: Some(child),
        kind: Kind::Stop {
            run_id: Some(run_id),
        },
    }))
}
