//! The Subagent card's job: start a child chat with the card's brief on the
//! agent, model and level the student chose, record the child on the card at
//! once, wait for its first run's report with no timeout of its own, and
//! finish with the report or the reason (docs/harness.md, "A Subagent card
//! starts a child chat").

use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use tauri::{AppHandle, Manager};

use crate::harness::app::children::{self, Brief, Report, Status, ONE_LEVEL};
use crate::harness::app::HarnessState;
use crate::harness::Provider;

use super::text;

/// The most of a child's report carried into "Cards in this thread"; the
/// whole of it stays in the child's chat.
pub(in crate::harness) const REPORT_CAP: usize = 12_000;

/// The card was taken back (a rewind) between its claim and its child.
const TAKEN_BACK: &str = "The card was taken back before its subagent started.";

/// The card's own fields, checked before its job is claimed.
pub(super) fn validate(state: &Value) -> Result<(), String> {
    text(state, "title")?;
    text(state, "task")?;
    provider(state)?;
    text(state, "model")?;
    match state.get("effort") {
        None | Some(Value::Null) | Some(Value::String(_)) => Ok(()),
        Some(_) => Err("effort must be text".into()),
    }
}

fn provider(state: &Value) -> Result<Provider, String> {
    let name = text(state, "provider")?;
    Provider::parse(name).ok_or_else(|| format!("unknown agent {name}"))
}

/// What the child is told and runs on: the card's task, agent, model and
/// level, as the student left them.
pub(in crate::harness) fn brief(parent: i64, state: &Value) -> Result<Brief, String> {
    validate(state)?;
    Ok(Brief {
        parent,
        text: text(state, "task")?.to_string(),
        provider: provider(state)?,
        model: text(state, "model")?.to_string(),
        effort: state
            .get("effort")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .map(str::to_owned),
    })
}

/// A card in a chat that is itself a child cannot start: refused before the
/// claim, so it stays pending and says why.
pub(super) async fn refusal(pool: &SqlitePool, thread: i64) -> Result<(), String> {
    let parent: Option<i64> =
        sqlx::query_scalar("SELECT parent_thread_id FROM harness_threads WHERE id = ?1")
            .bind(thread)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .flatten();
    match parent {
        Some(_) => Err(ONE_LEVEL.into()),
        None => Ok(()),
    }
}

/// Run the card's job to its report.
pub(super) async fn run(app: &AppHandle, id: &str, state: &Value) -> Result<String, String> {
    let harness = app.state::<HarnessState>();
    let pool = crate::db::store::open_pool().await?;
    let proposal = crate::db::proposals::get(&pool, id).await?;
    let brief = brief(proposal.thread_id, state)?;
    // One child per claim: the same start again (a retried call) is the same child.
    let started = state
        .pointer("/job/started_at")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let command_id = format!("subagent:{id}:{started}");
    let child = children::start(&harness, &command_id, brief).await?;
    let stop_id = format!("{command_id}:taken-back");
    let stop = children::stop(&harness, &stop_id, child);
    keep(&pool, id, child, stop).await?;
    publish(app, &pool, id).await;
    let report = children::wait(&harness, child).await?;
    let ended = serde_json::to_value(report.status).map_err(|e| e.to_string())?;
    record(&pool, id, "ended", ended).await?;
    outcome(report)
}

/// Write the started child on the card, or stop it with the reason: a child
/// the card cannot name has no Cancel, so it must not run on. The card is
/// gone (a rewind), or the write failed and its error is returned.
pub(in crate::harness) async fn keep(
    pool: &SqlitePool,
    id: &str,
    child: i64,
    stop: impl std::future::Future<Output = Result<(), String>>,
) -> Result<(), String> {
    let error = match record(pool, id, "child", Value::from(child)).await {
        Ok(true) => return Ok(()),
        Ok(false) => TAKEN_BACK.to_string(),
        Err(e) => e,
    };
    if let Err(e) = stop.await {
        elog!("[oculus] subagent card {id}: stopping child {child}: {e}");
    }
    Err(error)
}

/// The card's Cancel: stop its child's first run. The job then ends by the
/// child's report, `interrupted`, as any stop does.
#[tauri::command]
pub async fn proposal_subagent_stop(app: AppHandle, id: String) -> Result<(), String> {
    let pool = crate::db::store::open_pool().await?;
    let proposal = crate::db::proposals::get(&pool, &id).await?;
    let job = &proposal.state["job"];
    let child = match (job["phase"].as_str(), job["child"].as_i64()) {
        (Some("running"), Some(child)) => child,
        _ => return Ok(()),
    };
    let harness = app.state::<HarnessState>();
    children::stop(&harness, &format!("subagent-cancel:{id}:{child}"), child).await
}

async fn publish(app: &AppHandle, pool: &SqlitePool, id: &str) {
    let published = match crate::db::proposals::get(pool, id).await {
        Ok(proposal) => crate::harness::app::publish_proposal(app, proposal).await,
        Err(e) => Err(e),
    };
    if let Err(e) = published {
        elog!("[oculus] subagent card {id}: {e}");
    }
}

/// Write `key` into the running job's state; false when the card is no
/// longer running (taken back by a rewind, or its thread deleted).
pub(in crate::harness) async fn record(
    pool: &SqlitePool,
    id: &str,
    key: &str,
    value: Value,
) -> Result<bool, String> {
    let n = sqlx::query(
        "UPDATE chat_proposals SET state = json_set(state, '$.job.' || ?2, json(?3)), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
          WHERE item_id || '.' || block = ?1 AND kind = 'Subagent' AND json_extract(state, '$.job.phase') = 'running'",
    )
    .bind(id)
    .bind(key)
    .bind(value.to_string())
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();
    Ok(n == 1)
}

/// The job's result: the child's answer, cut to [`REPORT_CAP`] with a line
/// saying so; or why there is none, as its error.
pub(in crate::harness) fn outcome(report: Report) -> Result<String, String> {
    match (report.status, report.answer) {
        (Status::Completed, Some(answer)) => Ok(capped(&answer)),
        (_, _) => Err(report
            .reason
            .unwrap_or_else(|| "The subagent ended without a report.".into())),
    }
}

fn capped(answer: &str) -> String {
    let total = answer.chars().count();
    if total <= REPORT_CAP {
        return answer.to_string();
    }
    let kept: String = answer.chars().take(REPORT_CAP).collect();
    format!(
        "{kept}\n\n[Oculus cut this report at {REPORT_CAP} of its {total} characters. The whole report is in the subagent's chat.]"
    )
}

/// The children of `thread`'s Subagent cards from `item` on that are still
/// running: a rewind past them stops each one.
pub(in crate::harness) async fn running(
    conn: &mut SqliteConnection,
    thread: i64,
    item: i64,
) -> Result<Vec<i64>, String> {
    sqlx::query_scalar(
        "SELECT json_extract(state, '$.job.child') FROM chat_proposals
          WHERE thread_id = ?1 AND item_id >= ?2 AND kind = 'Subagent'
            AND json_extract(state, '$.job.phase') = 'running'
            AND json_type(state, '$.job.child') = 'integer'
          ORDER BY item_id, block",
    )
    .bind(thread)
    .bind(item)
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn card() -> Value {
        json!({"title": "Week 3", "task": "Summarise week 3", "provider": "codex", "model": "gpt-6.2-sol", "effort": "medium"})
    }

    #[tokio::test]
    async fn a_child_the_card_cannot_record_is_stopped_with_the_write_error() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        pool.close().await;
        let stopped = std::sync::atomic::AtomicBool::new(false);
        let stop = async {
            stopped.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        };
        let error = keep(&pool, "1.0", 7, stop).await.unwrap_err();
        assert!(stopped.load(std::sync::atomic::Ordering::SeqCst));
        assert_ne!(error, TAKEN_BACK, "the write's own error");
    }

    #[tokio::test]
    async fn a_child_whose_card_is_gone_is_stopped() {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE chat_proposals (item_id INTEGER, block INTEGER, kind TEXT, state TEXT, updated_at TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        let mut stopped = false;
        let stop = async {
            stopped = true;
            Ok(())
        };
        assert_eq!(keep(&pool, "1.0", 7, stop).await.unwrap_err(), TAKEN_BACK);
        assert!(stopped);
    }

    #[test]
    fn the_brief_is_the_cards_task_and_selection() {
        let brief = brief(4, &card()).unwrap();
        assert_eq!(brief.parent, 4);
        assert_eq!(brief.text, "Summarise week 3");
        assert_eq!(brief.provider, Provider::Codex);
        assert_eq!(brief.model, "gpt-6.2-sol");
        assert_eq!(brief.effort.as_deref(), Some("medium"));
        let mut no_level = card();
        no_level["effort"] = Value::Null;
        assert_eq!(super::brief(4, &no_level).unwrap().effort, None);
        for missing in ["task", "provider", "model"] {
            let mut unnamed = card();
            unnamed.as_object_mut().unwrap().remove(missing);
            assert!(super::brief(4, &unnamed).is_err(), "{missing}");
        }
        let mut unknown = card();
        unknown["provider"] = json!("cursor");
        assert!(validate(&unknown).is_err());
    }

    #[test]
    fn a_report_is_the_result_and_a_long_one_says_it_was_cut() {
        let done = |answer: &str| Report {
            status: Status::Completed,
            answer: Some(answer.into()),
            reason: None,
        };
        assert_eq!(outcome(done("All done.")), Ok("All done.".into()));
        let long = "é".repeat(REPORT_CAP + 5);
        let cut = outcome(done(&long)).unwrap();
        assert!(cut.starts_with(&"é".repeat(REPORT_CAP)));
        assert!(cut.ends_with(&format!(
            "[Oculus cut this report at {REPORT_CAP} of its {} characters. The whole report is in the subagent's chat.]",
            REPORT_CAP + 5
        )));
        let failed = Report {
            status: Status::Failed,
            answer: Some("half".into()),
            reason: Some("Codex is signed out.".into()),
        };
        assert_eq!(outcome(failed), Err("Codex is signed out.".into()));
        let silent = Report {
            status: Status::Completed,
            answer: None,
            reason: Some(crate::harness::app::children::NO_REPORT.into()),
        };
        assert_eq!(
            outcome(silent),
            Err(crate::harness::app::children::NO_REPORT.into())
        );
    }
}
