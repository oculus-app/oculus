use sqlx::{Row, SqlitePool};

use crate::harness::core::{Command, Kind};
use crate::harness::manager::policy::Mode;
use crate::harness::manager::validate_effort;
use crate::harness::requests::PermissionMode;
use crate::harness::{Provider, SendOptions};

/// The work a chat hands to a child, and what the child runs on. The model
/// is always named: a child never runs on a default.
pub struct Brief {
    /// The chat the child is started from.
    pub parent: i64,
    /// The child's first message: everything it is told of the work.
    pub text: String,
    pub provider: Provider,
    pub model: String,
    /// The reasoning level; `None` for a model that has none.
    pub effort: Option<String>,
}

/// Why a child cannot start a child of its own.
pub const ONE_LEVEL: &str =
    "This chat is a subagent itself, and a subagent cannot start another one.";

/// The send that starts `brief`'s child: a new thread under the parent's
/// subject and permission mode, naming its parent. Refused when the parent
/// is gone or is itself a child.
pub(in crate::harness) async fn command(
    pool: &SqlitePool,
    command_id: &str,
    brief: Brief,
) -> Result<Command, String> {
    let parent = sqlx::query(
        "SELECT subject_id, permission_mode, parent_thread_id FROM harness_threads WHERE id = ?1",
    )
    .bind(brief.parent)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("The chat this subagent was meant for no longer exists.")?;
    if parent.get::<Option<i64>, _>("parent_thread_id").is_some() {
        return Err(ONE_LEVEL.into());
    }
    let mode = parent
        .get::<Option<String>, _>("permission_mode")
        .as_deref()
        .and_then(PermissionMode::parse)
        .unwrap_or_default();
    let options = SendOptions {
        model: Some(brief.model),
        reasoning_effort: validate_effort(brief.effort)?,
        subject_id: parent.get("subject_id"),
        start_mode: Some(mode),
        parent_thread_id: Some(brief.parent),
        ..SendOptions::default()
    };
    Ok(Command {
        id: command_id.to_string(),
        thread_id: None,
        kind: Kind::Send {
            provider: brief.provider,
            text: brief.text,
            options,
            mode: Mode::Queue,
        },
    })
}
