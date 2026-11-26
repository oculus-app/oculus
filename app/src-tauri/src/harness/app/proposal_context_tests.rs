use super::proposal_context::{accepted, Audience, Cards, CARDS_CAP};
use serde_json::Value;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

/// A chat whose one session (binding 10) has seen run 100.
async fn pool() -> SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    for migration in crate::db::migrations::all() {
        sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
    }
    sqlx::raw_sql(
        "INSERT INTO harness_threads (id, provider) VALUES (1, 'claude');
         INSERT INTO harness_bindings (id, thread_id, provider, native_session, covered_through)
         VALUES (10, 1, 'claude', 's1', 1);
         INSERT INTO harness_runs (id, thread_id, ordinal, origin, binding_id, execution_status)
         VALUES (100, 1, 1, 'student', 10, 'completed');",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO chat_proposals(item_id,block,thread_id,kind,status,state,initial_state) VALUES(12,0,1,'NewTasks','pending','{\"project\":null,\"items\":[]}','{\"project\":null,\"items\":[]}')").execute(&pool).await.unwrap();
    pool
}

const SAME: Audience = Audience {
    binding: Some(10),
    fresh: false,
};

async fn read(pool: &SqlitePool, thread: i64, continuing: Option<&str>) -> Result<Cards, String> {
    super::proposal_context::read(pool, thread, continuing, SAME).await
}
fn cards(section: &str) -> Value {
    serde_json::from_str(section.lines().find(|s| s.starts_with('[')).unwrap()).unwrap()
}

#[tokio::test]
async fn pending_repeats_decided_once_and_failed_send_retries() {
    let pool = pool().await;
    let first = read(&pool, 1, None).await.unwrap();
    assert_eq!(cards(&first.section)[0]["edited"], false);
    accepted(&pool, first, 100).await.unwrap();
    assert!(read(&pool, 1, None)
        .await
        .unwrap()
        .section
        .contains("pending"));
    sqlx::query("UPDATE chat_proposals SET status='discarded'")
        .execute(&pool)
        .await
        .unwrap();
    let failed = read(&pool, 1, None).await.unwrap();
    assert!(failed.section.contains("discarded"));
    // A rejected dispatch never calls accepted.
    let retry = read(&pool, 1, None).await.unwrap();
    assert_eq!(retry.section, failed.section);
    accepted(&pool, retry, 100).await.unwrap();
    assert!(read(&pool, 1, None).await.unwrap().section.is_empty());
}

#[tokio::test]
async fn dispatch_reads_the_state_after_queueing_and_told_does_not_race() {
    let pool = pool().await;
    let queued = read(&pool, 1, None).await.unwrap();
    sqlx::query("UPDATE chat_proposals SET status='created',state='{\"items\":[{\"title\":\"Student edit\"}]}'").execute(&pool).await.unwrap();
    sqlx::query("INSERT INTO agent_changes(id,thread_id,proposal_id,entity,entity_id,op,after) VALUES(1,1,'12.0','task','42','create','{\"row\":{\"title\":\"Student edit\"}}')").execute(&pool).await.unwrap();
    accepted(&pool, queued, 100).await.unwrap();
    let dispatch = read(&pool, 1, None).await.unwrap();
    let context = cards(&dispatch.section);
    assert_eq!(context[0]["status"], "created");
    assert_eq!(context[0]["made"][0]["id"], 42);
    sqlx::query("UPDATE chat_proposals SET status='undone'")
        .execute(&pool)
        .await
        .unwrap();
    accepted(&pool, dispatch, 100).await.unwrap();
    assert_eq!(
        cards(&read(&pool, 1, None).await.unwrap().section)[0]["status"],
        "undone"
    );
}

#[tokio::test]
async fn a_continuation_lists_its_own_card_after_another_turn_told_it() {
    let pool = pool().await;
    sqlx::query("UPDATE chat_proposals SET status='created'")
        .execute(&pool)
        .await
        .unwrap();
    accepted(&pool, read(&pool, 1, None).await.unwrap(), 100)
        .await
        .unwrap();
    assert!(read(&pool, 1, None).await.unwrap().section.is_empty());
    let own = read(&pool, 1, Some("12.0")).await.unwrap();
    assert_eq!(cards(&own.section)[0]["id"], "12.0");
    assert!(read(&pool, 1, Some("13.0"))
        .await
        .unwrap()
        .section
        .is_empty());
}

/// Another binding, a session started without a native id to resume, and
/// a gone or uncovered telling run each hear a told card again.
#[tokio::test]
async fn a_card_counts_as_told_only_to_the_session_of_its_run() {
    let pool = pool().await;
    sqlx::query("UPDATE chat_proposals SET status='created'")
        .execute(&pool)
        .await
        .unwrap();
    accepted(&pool, read(&pool, 1, None).await.unwrap(), 100)
        .await
        .unwrap();
    assert!(read(&pool, 1, None).await.unwrap().section.is_empty());
    let other = Audience {
        binding: Some(11),
        fresh: false,
    };
    let fresh = Audience {
        binding: Some(10),
        fresh: true,
    };
    for audience in [other, fresh, Audience::NEW] {
        let cards = super::proposal_context::read(&pool, 1, None, audience)
            .await
            .unwrap();
        assert!(cards.section.contains("12.0"), "{audience:?}");
    }
    // The session lost what it had seen.
    sqlx::query("UPDATE harness_bindings SET covered_through = 0")
        .execute(&pool)
        .await
        .unwrap();
    assert!(read(&pool, 1, None).await.unwrap().section.contains("12.0"));
    // Seen again through a full handoff, which carries no card.
    sqlx::raw_sql(
        "UPDATE harness_bindings SET covered_through = 2;
         INSERT INTO harness_runs (id, thread_id, ordinal, origin, binding_id, execution_status)
         VALUES (101, 1, 2, 'student', 10, 'completed');
         INSERT INTO harness_handoffs (thread_id, run_id, to_binding_id, kind, covered_from, covered_to, items, status)
         VALUES (1, 101, 10, 'full', 1, 1, '[]', 'inline');",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(read(&pool, 1, None).await.unwrap().section.contains("12.0"));
}

/// Over the cap the newest cards go and the section counts the rest; the
/// continued card is always among them, and the rest come next time.
#[tokio::test]
async fn the_cap_keeps_the_newest_and_the_continued_card() {
    let pool = pool().await;
    let report = "r".repeat(CARDS_CAP / 3 - 200);
    for item in 13..=17 {
        let state = serde_json::json!({"job": {"phase": "complete", "result": report}}).to_string();
        sqlx::query("INSERT INTO chat_proposals(item_id,block,thread_id,kind,status,state,initial_state) VALUES(?1,0,1,'Subagent','created',?2,?2)")
            .bind(item).bind(state).execute(&pool).await.unwrap();
    }
    sqlx::query("UPDATE chat_proposals SET status='created', state='{}' WHERE item_id = 12")
        .execute(&pool)
        .await
        .unwrap();
    let ids = |listed: &Cards| -> Vec<String> {
        cards(&listed.section)
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["id"].as_str().unwrap().to_string())
            .collect()
    };
    let first = read(&pool, 1, Some("13.0")).await.unwrap();
    assert_eq!(ids(&first), ["13.0", "16.0", "17.0"]);
    assert!(
        first.section.contains("3 older cards are not listed here"),
        "{}",
        first.section
    );
    accepted(&pool, first, 100).await.unwrap();
    let next = read(&pool, 1, None).await.unwrap();
    assert_eq!(ids(&next), ["12.0", "14.0", "15.0"]);
    assert!(!next.section.contains("not listed"));
}
