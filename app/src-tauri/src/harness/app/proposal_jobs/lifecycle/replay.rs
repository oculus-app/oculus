use super::*;
use serde_json::Value;

pub async fn claim_once(pool: &SqlitePool, id: &str) -> Value {
    let (proposal, claimed) = claim(pool, id).await.unwrap();
    assert!(claimed);
    assert!(!claim(pool, id).await.unwrap().1);
    proposal.state
}

pub async fn finish_job(pool: &SqlitePool, id: &str, result: Result<String, String>) -> Value {
    assert!(save_finish(pool, id, result).await.unwrap());
    crate::db::proposals::get(pool, id).await.unwrap().state
}

/// A scratch database whose card runs a Download, a pool that writes it
/// without waiting for a lock, and a second connection that can hold one.
async fn locked_card(
    name: &str,
) -> (
    SqlitePool,
    sqlx::SqliteConnection,
    crate::test_support::Scratch,
) {
    use sqlx::Connection;
    let scratch = crate::test_support::Scratch::new(name);
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(scratch.join("oculus.db"))
        .create_if_missing(true)
        .busy_timeout(std::time::Duration::ZERO);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .unwrap();
    for migration in crate::db::migrations::all() {
        sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
    }
    sqlx::raw_sql(
        r#"INSERT INTO harness_threads (id, provider) VALUES (1, 'codex');
           INSERT INTO harness_items (id, thread_id, kind, content) VALUES (12, 1, 'assistant', 'card');
           INSERT INTO chat_proposals (item_id, block, thread_id, kind, status, state, initial_state, told)
           VALUES (12, 0, 1, 'Download', 'created', '{"job":{"phase":"running","error":"old"}}', '{}', 'created');"#,
    )
    .execute(&pool)
    .await
    .unwrap();
    let lock = sqlx::SqliteConnection::connect_with(&options)
        .await
        .unwrap();
    (pool, lock, scratch)
}

#[tokio::test]
async fn a_job_finish_that_cannot_be_written_is_the_callers_error() {
    let (pool, mut lock, _scratch) = locked_card("finish-locked").await;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut lock)
        .await
        .unwrap();
    let result = save_finish(&pool, "12.0", Ok("Report".into())).await;
    assert!(result.is_err(), "a held write lock returned {result:?}");
    sqlx::query("ROLLBACK").execute(&mut lock).await.unwrap();
    let state = crate::db::proposals::get(&pool, "12.0")
        .await
        .unwrap()
        .state;
    assert_eq!(state["job"]["phase"], "running");
}

#[tokio::test]
async fn a_job_finish_whose_first_write_fails_is_written_on_a_retry() {
    let (pool, mut lock, _scratch) = locked_card("finish-retry").await;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut lock)
        .await
        .unwrap();
    let release = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        sqlx::query("ROLLBACK").execute(&mut lock).await.unwrap();
    });
    assert!(save_finish(&pool, "12.0", Ok("Report".into()))
        .await
        .unwrap());
    release.await.unwrap();
    let card = crate::db::proposals::get(&pool, "12.0").await.unwrap();
    assert_eq!(card.state["job"]["phase"], "complete");
    assert_eq!(card.state["job"]["result"], "Report");
    assert!(card.state["job"].get("error").is_none());
    assert!(card.state["job"]["finished_at"].as_str().is_some());
    assert_eq!(card.told, None);
}
