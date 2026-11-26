use super::runner::run;
use super::validate;
use crate::harness::app::publish_proposal;
use serde_json::json;
use sqlx::SqlitePool;
use tauri::AppHandle;
#[tauri::command]
pub async fn proposal_job_start(
    app: AppHandle,
    id: String,
) -> Result<crate::db::proposals::Proposal, String> {
    // Startup's repair fails every job it finds running: this one starts after it.
    crate::harness::app::ready(&app).await?;
    let pool = crate::db::store::open_pool().await?;
    let (proposal, claimed) = claim(&pool, &id).await?;
    if !claimed {
        return Ok(proposal);
    }
    if let Err(error) = publish_proposal(&app, proposal.clone()).await {
        elog!("[oculus] proposal job event: {error}");
    }
    let running = proposal.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = run(&app, &id, &running.kind, &running.state).await;
        if let Err(e) = finish(&app, &pool, &id, outcome).await {
            elog!("[oculus] proposal job: {e}");
        }
    });
    Ok(proposal)
}

async fn finish(
    app: &AppHandle,
    pool: &SqlitePool,
    id: &str,
    outcome: Result<String, String>,
) -> Result<(), String> {
    // A rewind or a deleted thread took the card while its job ran.
    if !save_finish(pool, id, outcome).await? {
        return Ok(());
    }
    let proposal = crate::db::proposals::get(pool, id).await?;
    publish_proposal(app, proposal.clone()).await?;
    crate::harness::app::card_settled(app, &proposal).await
}

/// The finish's one write, retried this many times in all, the wait
/// doubling from [`FINISH_RETRY_FIRST`] between tries.
const FINISH_TRIES: u32 = 5;
const FINISH_RETRY_FIRST: std::time::Duration = std::time::Duration::from_millis(50);

/// Write the job's outcome on its card: false when the card is gone (a
/// rewind or a deleted thread). The outcome is in hand and nothing is read
/// first, so only the write can fail: it is retried before that is an error.
async fn save_finish(
    pool: &SqlitePool,
    id: &str,
    outcome: Result<String, String>,
) -> Result<bool, String> {
    let (item, block) = crate::db::proposals::key(id)?;
    let (phase, kept, text, dropped) = match &outcome {
        Ok(result) => ("complete", "$.job.result", result, "$.job.error"),
        Err(error) => ("error", "$.job.error", error, "$.job.result"),
    };
    let finished_at = chrono::Utc::now().to_rfc3339();
    let mut wait = FINISH_RETRY_FIRST;
    let mut tries = 0;
    loop {
        tries += 1;
        let written = sqlx::query(
            "UPDATE chat_proposals
                SET state = json_remove(json_set(state, '$.job.finished_at', ?3, '$.job.phase', ?4, ?5, ?6), ?7),
                    told = NULL, told_run_id = NULL,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
              WHERE item_id = ?1 AND block = ?2 AND status = 'created'",
        )
        .bind(item)
        .bind(block)
        .bind(&finished_at)
        .bind(phase)
        .bind(kept)
        .bind(text)
        .bind(dropped)
        .execute(pool)
        .await;
        match written {
            Ok(done) => return Ok(done.rows_affected() == 1),
            Err(e) if tries >= FINISH_TRIES => return Err(e.to_string()),
            Err(e) => {
                elog!(
                    "[oculus] proposal job {id}: finish not saved, trying again in {wait:?}: {e}"
                );
                tokio::time::sleep(wait).await;
                wait *= 2;
            }
        }
    }
}

/// Persist identity before progress starts, so cards never adopt another sync.
pub(super) async fn record_run(app: &AppHandle, id: &str, run_id: i64) -> Result<(), String> {
    let pool = crate::db::store::open_pool().await?;
    sqlx::query("UPDATE chat_proposals SET state=json_set(state,'$.job.run_id',?2), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE item_id || '.' || block=?1 AND json_extract(state,'$.job.phase')='running'")
        .bind(id).bind(run_id).execute(&pool).await.map_err(|e| e.to_string())?;
    publish_proposal(app, crate::db::proposals::get(&pool, id).await?).await
}

/// A process restart cannot resume an external job. Keep its confirmation
/// decided and surface the interruption instead of rearming a billed action.
pub(crate) async fn reconcile(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query("UPDATE chat_proposals SET told=NULL, state=json_set(state,'$.job.phase','error','$.job.interrupted',json('true'),'$.job.finished_at',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'$.job.error','The app closed before this job finished; check its result before proposing another run.'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='created' AND json_extract(state,'$.job.phase')='running'")
        .execute(pool).await.map(|_|()).map_err(|e|e.to_string())
}

async fn claim(
    pool: &SqlitePool,
    id: &str,
) -> Result<(crate::db::proposals::Proposal, bool), String> {
    let proposal = crate::db::proposals::get(pool, id).await?;
    validate(&proposal.kind, &proposal.state)?;
    if proposal.kind == "Subagent" {
        super::subagent::refusal(pool, proposal.thread_id).await?;
    }
    let mut state = proposal.state.clone();
    state["job"] = json!({"phase":"running", "started_at":chrono::Utc::now().to_rfc3339()});
    // Start again: a Subagent the app closed during is a fresh click's, with
    // a follow-up of its own.
    if let Some(card) = state.as_object_mut() {
        card.remove("continuation");
    }
    let changed = sqlx::query("UPDATE chat_proposals SET status = 'created', state = ?3, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE item_id = ?1 AND block = ?2 AND state = ?4 AND (status = 'pending' OR (kind = 'Subagent' AND status = 'created' AND json_type(state, '$.job.interrupted') = 'true')) AND EXISTS (SELECT 1 FROM harness_items i JOIN harness_threads t ON t.id=i.thread_id WHERE i.id=chat_proposals.item_id AND i.thread_id=chat_proposals.thread_id)")
        .bind(proposal.item_id).bind(proposal.block).bind(state.to_string()).bind(proposal.state.to_string()).execute(pool).await.map_err(|e| e.to_string())?.rows_affected();
    Ok((crate::db::proposals::get(pool, id).await?, changed > 0))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn a_job_is_claimed_once_and_restart_cannot_rearm_it() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../../db/proposals/schema.sql"))
            .execute(&pool)
            .await
            .unwrap();
        sqlx::raw_sql("ALTER TABLE chat_proposals ADD COLUMN told_run_id INTEGER;CREATE TABLE harness_threads(id INTEGER);CREATE TABLE harness_items(id INTEGER,thread_id INTEGER);INSERT INTO harness_threads VALUES(1);INSERT INTO harness_items VALUES(12,1);").execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO chat_proposals(item_id,block,thread_id,kind,state,initial_state) VALUES(12,0,1,'Download','{\"item\":\"aligner\"}','{\"item\":\"aligner\"}')").execute(&pool).await.unwrap();
        let (a, b) = tokio::join!(claim(&pool, "12.0"), claim(&pool, "12.0"));
        assert_ne!(a.unwrap().1, b.unwrap().1);
        let proposal = crate::db::proposals::get(&pool, "12.0").await.unwrap();
        assert_eq!(proposal.status, "created");
        assert_eq!(proposal.state["job"]["phase"], "running");
        let started = proposal.state["job"]["started_at"].clone();
        assert!(started.as_str().is_some());
        save_finish(&pool, "12.0", Ok("Aligner downloaded".into()))
            .await
            .unwrap();
        let complete = crate::db::proposals::get(&pool, "12.0").await.unwrap();
        assert_eq!(complete.state["job"]["phase"], "complete");
        assert_eq!(complete.state["job"]["result"], "Aligner downloaded");
        assert_eq!(complete.state["job"]["started_at"], started);
        assert!(complete.state["job"]["finished_at"].as_str().is_some());
        assert_eq!(complete.told, None);
        sqlx::query("UPDATE chat_proposals SET state=json_set(state,'$.job.phase','running','$.job.run_id',42)").execute(&pool).await.unwrap();
        reconcile(&pool).await.unwrap();
        let (proposal, again) = claim(&pool, "12.0").await.unwrap();
        assert!(!again);
        assert_eq!(proposal.state["job"]["phase"], "error");
        assert_eq!(proposal.told, None);
        assert_eq!(proposal.state["job"]["started_at"], started);
        assert_eq!(proposal.state["job"]["run_id"], 42);
        assert!(proposal.state["job"]["finished_at"].as_str().is_some());
        assert!(proposal.state["job"]["error"]
            .as_str()
            .unwrap()
            .contains("app closed"));
        save_finish(&pool, "12.0", Err("Parse failed".into()))
            .await
            .unwrap();
        assert_eq!(
            crate::db::proposals::get(&pool, "12.0")
                .await
                .unwrap()
                .state["job"]["error"],
            "Parse failed"
        );
        sqlx::raw_sql("UPDATE chat_proposals SET status='pending';DELETE FROM harness_items")
            .execute(&pool)
            .await
            .unwrap();
        assert!(!claim(&pool, "12.0").await.unwrap().1);
    }

    /// A Subagent card in a child chat is refused before its claim and
    /// stays pending; one the app closed during starts again on a click,
    /// with a fresh follow-up; a rewind finds its running child.
    #[tokio::test]
    async fn a_subagent_card_is_refused_in_a_child_and_starts_again_after_a_quit() {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        for migration in crate::db::migrations::all() {
            sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
        }
        let card = r#"{"title":"Week 3","task":"Summarise week 3","provider":"codex","model":"gpt-6.2-sol","effort":"medium","then":"Go on"}"#;
        sqlx::raw_sql(&format!(
            "INSERT INTO harness_threads (id, provider) VALUES (1, 'codex');
             INSERT INTO harness_threads (id, provider, parent_thread_id) VALUES (2, 'claude', 1);
             INSERT INTO harness_items (id, thread_id, kind, content) VALUES (10, 1, 'assistant', 'card'), (20, 2, 'assistant', 'card');
             INSERT INTO chat_proposals (item_id, block, thread_id, kind, state, initial_state) VALUES
               (10, 0, 1, 'Subagent', '{card}', '{card}'), (20, 0, 2, 'Subagent', '{card}', '{card}');"
        ))
        .execute(&pool)
        .await
        .unwrap();

        let refused = claim(&pool, "20.0").await.err();
        assert_eq!(
            refused.as_deref(),
            Some(crate::harness::app::children::ONE_LEVEL)
        );
        let still = crate::db::proposals::get(&pool, "20.0").await.unwrap();
        assert_eq!(still.status, "pending");

        let (running, claimed) = claim(&pool, "10.0").await.unwrap();
        assert!(claimed);
        assert!(
            super::super::subagent::record(&pool, "10.0", "child", json!(2))
                .await
                .unwrap()
        );
        let mut tx = pool.begin().await.unwrap();
        let children = super::super::subagent::running(&mut tx, 1, 10)
            .await
            .unwrap();
        assert_eq!(children, [2]);
        assert!(super::super::subagent::running(&mut tx, 1, 11)
            .await
            .unwrap()
            .is_empty());
        drop(tx);
        assert!(!claim(&pool, "10.0").await.unwrap().1, "running: one claim");

        reconcile(&pool).await.unwrap();
        crate::harness::app::continuation::reconcile(&pool)
            .await
            .unwrap();
        let quit = crate::db::proposals::get(&pool, "10.0").await.unwrap();
        assert_eq!(quit.state["job"]["interrupted"], true);
        assert_eq!(quit.state["continuation"]["phase"], "skipped");
        let (again, claimed) = claim(&pool, "10.0").await.unwrap();
        assert!(claimed, "Start again");
        assert_eq!(again.state["job"]["phase"], "running");
        assert_ne!(
            again.state["job"]["started_at"],
            running.state["job"]["started_at"]
        );
        assert!(
            again.state.get("continuation").is_none(),
            "a fresh follow-up"
        );
        assert!(again.state["job"].get("child").is_none());

        // A finished card is not started again.
        save_finish(&pool, "10.0", Ok("Done".into())).await.unwrap();
        assert!(!claim(&pool, "10.0").await.unwrap().1);
        // A card a rewind took finishes quietly.
        sqlx::query("DELETE FROM chat_proposals")
            .execute(&pool)
            .await
            .unwrap();
        assert!(!save_finish(&pool, "10.0", Ok("Done".into())).await.unwrap());
    }
}

#[cfg(test)]
pub(in crate::harness) mod replay;
