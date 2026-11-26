//! A card's continuation (`app/continuation.rs`): once per card, never after
//! a rewind, a restart or a Stop, queued behind a busy thread, and replayed
//! through each bridge to its answer.

use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

use crate::harness::app::continuation::{self, SKIPPED_JOB, SKIPPED_QUEUED, STOPPED};
use crate::harness::{store, HarnessEvent, Provider};

use super::commands::{ended, Bench};
use super::guard::{assert_scratch, scratch};
use super::replay::run;
use super::scenario::Scenario;

const THEN: &str = "Check the new Ed threads for extension posts";

/// A reply holding a finished Sync card whose agent asked to continue.
pub(super) async fn seed_card(pool: &SqlitePool, thread: i64) -> String {
    let state = json!({
        "subjects": ["COMP30026"],
        "then": THEN,
        "job": {"phase": "complete", "started_at": "2026-11-08T01:00:00Z",
                "finished_at": "2026-11-08T01:02:00Z", "result": "12 new files, 3 new Ed threads"},
    });
    card(pool, thread, "Sync", "created", &state).await
}

/// The report a finished Subagent card carries.
pub(super) const REPORT: &str = "Week 3 covers DFAs; the closure proofs are in lecture 6.";

/// A reply holding a Subagent card whose child reported, with a follow-up:
/// a reply of its own, or the next block of `beside`'s.
pub(super) async fn seed_subagent_card(
    pool: &SqlitePool,
    thread: i64,
    beside: Option<&str>,
) -> String {
    let state = json!({
        "title": "Summarise week 3", "task": "Read week 3 and summarise it",
        "provider": "codex", "model": "gpt-6.2-sol", "effort": "medium", "then": THEN,
        "job": {"phase": "complete", "started_at": "2026-11-08T01:00:00Z", "child": 99,
                "ended": "completed", "finished_at": "2026-11-08T01:02:00Z", "result": REPORT},
    });
    let reply = beside.and_then(|id| id.split_once('.')?.0.parse().ok());
    card_in(pool, thread, reply, "Subagent", "created", &state).await
}

/// The report of a second Subagent card in the same reply.
pub(super) const SIBLING_REPORT: &str = "Week 4 covers NFAs and the subset construction.";

/// A second finished Subagent card, the first block of a reply that
/// [`seed_subagent_card`] can add its card to.
pub(super) async fn seed_sibling_card(pool: &SqlitePool, thread: i64) -> String {
    let state = json!({
        "title": "Summarise week 4", "task": "Read week 4 and summarise it",
        "provider": "codex", "model": "gpt-6.2-sol", "effort": "medium", "then": THEN,
        "job": {"phase": "complete", "started_at": "2026-11-08T01:00:00Z", "child": 98,
                "ended": "completed", "finished_at": "2026-11-08T01:02:00Z",
                "result": SIBLING_REPORT},
    });
    card(pool, thread, "Subagent", "created", &state).await
}

/// A card on a reply of its own.
pub(super) async fn card(
    pool: &SqlitePool,
    thread: i64,
    kind: &str,
    status: &str,
    state: &Value,
) -> String {
    card_in(pool, thread, None, kind, status, state).await
}

/// A card as the next block of `reply`, or of a new reply.
async fn card_in(
    pool: &SqlitePool,
    thread: i64,
    reply: Option<i64>,
    kind: &str,
    status: &str,
    state: &Value,
) -> String {
    let item = match reply {
        Some(item) => item,
        None => sqlx::query(
            "INSERT INTO harness_items (thread_id, kind, content) VALUES (?1, 'assistant', 'A card')",
        )
        .bind(thread)
        .execute(pool)
        .await
        .unwrap()
        .last_insert_rowid(),
    };
    let block: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM chat_proposals WHERE item_id = ?1")
        .bind(item)
        .fetch_one(pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO chat_proposals (item_id, block, thread_id, kind, status, state, initial_state) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)")
        .bind(item)
        .bind(block)
        .bind(thread)
        .bind(kind)
        .bind(status)
        .bind(state.to_string())
        .execute(pool)
        .await
        .unwrap();
    format!("{item}.{block}")
}

/// What a continuation sends the provider, read before it starts: on the
/// chat's current session, which it resumes.
pub(super) async fn prompt_for(pool: &SqlitePool, thread: i64, card: &str) -> String {
    let binding: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM harness_bindings WHERE thread_id = ?1 AND current = 1 ORDER BY id DESC",
    )
    .bind(thread)
    .fetch_optional(pool)
    .await
    .unwrap();
    let audience = crate::harness::app::proposal_context::Audience {
        binding,
        fresh: false,
    };
    crate::harness::app::send::prompt(pool, thread, "", Some(card), None, audience)
        .await
        .unwrap()
        .0
}

/// A recorded frame, sending `prompt` where the recording sent its request.
pub(super) fn resend_as(frame: Value, prompt: &str) -> Value {
    match frame {
        Value::String(s) => Value::String(s.replace("Replay request", prompt)),
        Value::Array(a) => a.into_iter().map(|v| resend_as(v, prompt)).collect(),
        Value::Object(o) => o
            .into_iter()
            .map(|(k, v)| (k, resend_as(v, prompt)))
            .collect(),
        v => v,
    }
}

/// The scratch directory lives as long as the returned guard.
async fn scratch_pool(name: &str) -> (crate::test_support::Scratch, SqlitePool, i64) {
    let dir = scratch(name);
    let database = assert_scratch(&dir.join("oculus.db"), &dir);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(database)
                .create_if_missing(true),
        )
        .await
        .unwrap();
    for migration in crate::db::migrations::all() {
        sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
    }
    let thread = store::create_thread(&pool, Provider::Codex, None, None, None, "q")
        .await
        .unwrap();
    (dir, pool, thread)
}

fn intent(thread: i64, card: &str, receipt: &str) -> store::SendIntent {
    store::SendIntent {
        thread_id: thread,
        provider: Provider::Codex,
        model: None,
        effort: None,
        binding: None,
        receipt: receipt.into(),
        text: "Sync finished — continuing".into(),
        at: None,
        continuation: Some(card.into()),
        queued: None,
        options: None,
        brief_from: None,
    }
}

async fn state(pool: &SqlitePool, card: &str) -> Value {
    crate::db::proposals::get(pool, card).await.unwrap().state
}

async fn count(pool: &SqlitePool, sql: &str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

#[tokio::test]
async fn a_card_continues_once() {
    let (_dir, pool, thread) = scratch_pool("continue-once").await;
    let card = seed_card(&pool, thread).await;
    assert_eq!(
        continuation::claim(&pool, thread, &card).await.unwrap(),
        Some("Sync finished — continuing".into())
    );
    assert_eq!(
        continuation::claim(&pool, thread, &card).await.unwrap(),
        None,
        "a second settle claims nothing"
    );
    assert_eq!(state(&pool, &card).await["continuation"]["phase"], "queued");

    let run = store::begin_run(&pool, &intent(thread, &card, "c1"))
        .await
        .unwrap();
    let (kind, content, meta): (String, String, String) =
        sqlx::query_as("SELECT kind, content, meta FROM harness_items WHERE id = ?1")
            .bind(run.item_id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(kind, "continuation", "a run with no question row");
    assert_eq!(content, "Sync finished — continuing");
    assert_eq!(
        serde_json::from_str::<Value>(&meta).unwrap()["proposal"],
        card
    );
    let origin: String = sqlx::query_scalar("SELECT origin FROM harness_runs WHERE id = ?1")
        .bind(run.run_id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(origin, "continuation");
    let claim = state(&pool, &card).await["continuation"].clone();
    assert_eq!(claim, json!({"phase": "started", "run_id": run.run_id}));

    let again = store::begin_run(&pool, &intent(thread, &card, "c2")).await;
    assert_eq!(again.unwrap_err(), store::NOT_CLAIMED);
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM harness_runs").await, 1);
    assert_eq!(
        count(
            &pool,
            "SELECT COUNT(*) FROM harness_items WHERE kind IN ('user', 'continuation')"
        )
        .await,
        1
    );
    pool.close().await;
}

#[tokio::test]
async fn only_a_settled_card_with_a_follow_up_continues() {
    let (_dir, pool, thread) = scratch_pool("continue-settled").await;
    let then = |extra: Value| {
        let mut v = json!({"subjects": ["COMP30026"], "then": THEN});
        v.as_object_mut()
            .unwrap()
            .extend(extra.as_object().unwrap().clone());
        v
    };
    let pending = card(&pool, thread, "Sync", "pending", &then(json!({}))).await;
    let running = card(
        &pool,
        thread,
        "Sync",
        "created",
        &then(json!({"job": {"phase": "running"}})),
    )
    .await;
    let silent = card(
        &pool,
        thread,
        "Sync",
        "created",
        &json!({"subjects": ["X"], "job": {"phase": "complete"}}),
    )
    .await;
    let blank = card(
        &pool,
        thread,
        "Sync",
        "created",
        &then(json!({"then": "  ", "job": {"phase": "complete"}})),
    )
    .await;
    for id in [&pending, &running, &silent, &blank] {
        assert_eq!(
            continuation::claim(&pool, thread, id).await.unwrap(),
            None,
            "{id}"
        );
    }
    let failed = card(
        &pool,
        thread,
        "Sync",
        "created",
        &then(json!({"job": {"phase": "error", "error": "offline"}})),
    )
    .await;
    let discarded = card(&pool, thread, "Sync", "discarded", &then(json!({}))).await;
    let subagent = |ended: &str| {
        then(json!({"job": {"phase": "error", "ended": ended, "error": "No report."}}))
    };
    let stopped = card(
        &pool,
        thread,
        "Subagent",
        "created",
        &subagent("interrupted"),
    )
    .await;
    let broke = card(&pool, thread, "Subagent", "created", &subagent("failed")).await;
    let tasks = card(
        &pool,
        thread,
        "NewTasks",
        "created",
        &json!({"project": null, "items": [], "then": THEN}),
    )
    .await;
    for (id, line) in [
        (&failed, "Sync failed — continuing"),
        (&discarded, "Card discarded — continuing"),
        (&stopped, "Subagent stopped — continuing"),
        (&broke, "Subagent failed — continuing"),
        (&tasks, "Tasks created — continuing"),
    ] {
        assert_eq!(
            continuation::claim(&pool, thread, id)
                .await
                .unwrap()
                .as_deref(),
            Some(line)
        );
    }
    // Another thread's id never claims this one's card.
    assert_eq!(
        continuation::claim(&pool, thread + 1, &seed_card(&pool, thread).await)
            .await
            .unwrap(),
        None
    );
    let prompt = continuation::prompt(&pool, &discarded).await.unwrap();
    assert!(prompt.starts_with("(From Oculus, not typed by the student.)"));
    assert!(prompt.contains("was discarded by the student") && prompt.ends_with(THEN));
    for (id, outcome) in [
        (&stopped, "card {} was stopped;"),
        (&broke, "card {} failed;"),
    ] {
        let prompt = continuation::prompt(&pool, id).await.unwrap();
        assert!(prompt.contains(&outcome.replace("{}", id)), "{prompt}");
    }
    pool.close().await;
}

#[tokio::test]
async fn a_rewind_or_delete_past_the_card_starts_nothing() {
    let (_dir, pool, thread) = scratch_pool("continue-rewind").await;
    // Queued behind a turn, then the student rewinds past the card.
    let card = seed_card(&pool, thread).await;
    assert!(continuation::claim(&pool, thread, &card)
        .await
        .unwrap()
        .is_some());
    let item = crate::db::proposals::key(&card).unwrap().0;
    store::truncate_from(&pool, thread, item).await.unwrap();
    let begun = store::begin_run(&pool, &intent(thread, &card, "r1")).await;
    assert_eq!(begun.unwrap_err(), store::NOT_CLAIMED);
    assert_eq!(
        count(&pool, "SELECT COUNT(*) FROM harness_runs").await,
        0,
        "nothing written"
    );
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM harness_items").await, 0);

    // A job still running when its card was rewound away settles to nothing.
    let card = seed_card(&pool, thread).await;
    let item = crate::db::proposals::key(&card).unwrap().0;
    store::truncate_from(&pool, thread, item).await.unwrap();
    assert_eq!(
        continuation::claim(&pool, thread, &card).await.unwrap(),
        None
    );

    let card = seed_card(&pool, thread).await;
    store::delete_thread(&pool, thread).await.unwrap();
    assert_eq!(
        continuation::claim(&pool, thread, &card).await.unwrap(),
        None
    );
    pool.close().await;
}

#[tokio::test]
async fn a_restart_or_a_stop_never_continues_and_the_card_says_why() {
    let (_dir, pool, thread) = scratch_pool("continue-restart").await;
    let during = card(
        &pool,
        thread,
        "Sync",
        "created",
        &json!({"subjects": ["X"], "then": THEN, "job": {"phase": "running"}}),
    )
    .await;
    let queued = seed_card(&pool, thread).await;
    assert!(continuation::claim(&pool, thread, &queued)
        .await
        .unwrap()
        .is_some());

    crate::harness::app::proposal_jobs::lifecycle::reconcile(&pool)
        .await
        .unwrap();
    continuation::reconcile(&pool).await.unwrap();
    assert_eq!(
        state(&pool, &during).await["continuation"],
        json!({"phase": "skipped", "reason": SKIPPED_JOB})
    );
    assert_eq!(state(&pool, &during).await["job"]["phase"], "error");
    assert_eq!(
        continuation::claim(&pool, thread, &during).await.unwrap(),
        None
    );
    assert_eq!(
        state(&pool, &queued).await["continuation"],
        json!({"phase": "skipped", "reason": SKIPPED_QUEUED})
    );
    assert_eq!(
        store::begin_run(&pool, &intent(thread, &queued, "q1"))
            .await
            .unwrap_err(),
        store::NOT_CLAIMED
    );

    // Stop drops a queued continuation (`harness_interrupt`).
    let stopped = seed_card(&pool, thread).await;
    assert!(continuation::claim(&pool, thread, &stopped)
        .await
        .unwrap()
        .is_some());
    assert!(continuation::cancel(&pool, &stopped, STOPPED)
        .await
        .unwrap());
    assert!(!continuation::cancel(&pool, &stopped, STOPPED)
        .await
        .unwrap());
    assert_eq!(
        state(&pool, &stopped).await["continuation"]["reason"],
        STOPPED
    );
    assert_eq!(
        store::begin_run(&pool, &intent(thread, &stopped, "s1"))
            .await
            .unwrap_err(),
        store::NOT_CLAIMED
    );
    assert_eq!(count(&pool, "SELECT COUNT(*) FROM harness_runs").await, 0);
    pool.close().await;
}

#[test]
fn a_continuation_waits_behind_a_busy_thread_and_goes_out_once() {
    let mut bench = Bench::new("continue-queue");
    let (pool, thread) = (bench.pool.clone(), bench.thread);
    let settled = |bench: &Bench, card: &str| {
        bench.app(HarnessEvent::CardSettled {
            proposal: card.into(),
        })
    };
    let seed = |bench: &Bench| bench.runtime.block_on(seed_card(&pool, thread));
    let card = seed(&bench);
    // A turn is running when the card settles, in two views.
    let (first, _) = bench.send("c1", "first");
    bench.play(vec![first, settled(&bench, &card), settled(&bench, &card)]);
    assert_eq!(
        bench.effects(),
        ["start first"],
        "the running turn keeps the thread"
    );
    assert!(
        bench
            .runtime
            .block_on(store::queue::list(&pool, thread))
            .unwrap()
            .is_empty(),
        "never shown as typed"
    );
    assert_eq!(
        bench.count(
            "SELECT COUNT(*) FROM harness_runs WHERE execution_status = 'queued' AND origin = 'continuation'"
        ),
        1,
        "it waits as a queued run, once"
    );
    let events = bench.events();
    let snapshot = events
        .iter()
        .find(|e| e["event"]["type"] == "proposal")
        .unwrap();
    assert_eq!(
        snapshot["event"]["proposal"]["state"]["continuation"]["phase"],
        "queued"
    );

    bench.play(vec![bench.app(ended("completed"))]);
    let starts = bench.starts();
    assert_eq!(starts.len(), 2, "one continuation, after the turn");
    let start = &starts[1];
    assert_eq!(start.text, "Sync finished — continuing");
    assert_eq!(start.options.continuation.as_deref(), Some(card.as_str()));
    let origin: String = bench
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT origin FROM harness_runs WHERE id = ?1")
                .bind(start.run.run_id)
                .fetch_one(&pool),
        )
        .unwrap();
    assert_eq!(
        origin, "continuation",
        "its run was written before the send"
    );
    assert_eq!(
        bench.runtime.block_on(state(&pool, &card))["continuation"]["phase"],
        "started"
    );

    // A continuation whose claim is gone by its turn starts nothing and
    // hands the thread on.
    let stopped = seed(&bench);
    bench.play(vec![settled(&bench, &stopped)]);
    assert!(bench
        .runtime
        .block_on(continuation::cancel(&pool, &stopped, STOPPED))
        .unwrap());
    bench.play(vec![bench.app(ended("completed"))]);
    assert_eq!(
        bench.starts().len(),
        2,
        "the cancelled card started nothing"
    );
    assert!(!bench.open());

    // On an idle thread it goes out at once.
    let idle = seed(&bench);
    bench.play(vec![settled(&bench, &idle)]);
    assert_eq!(bench.starts().len(), 3);
    assert!(bench.open());
}

#[test]
fn a_finished_job_starts_one_run_whose_answer_appears() {
    for name in [
        "claude-ls",
        "codex-ls",
        "opencode-v1-ls",
        "antigravity-acp-ls",
    ] {
        let mut scenario = Scenario::recorded(name);
        scenario.continuation = true;
        let replay = run(scenario);
        assert_eq!(replay.continuations.len(), 1, "{name}: one continuation");
        let runs = replay.ledger["runs"].as_array().unwrap();
        assert_eq!(runs.len(), 1, "{name}");
        let run = &runs[0];
        assert_eq!(run["origin"], "continuation", "{name}");
        assert_eq!(run["execution_status"], "completed", "{name}");
        assert!(
            !replay.items.iter().any(|i| i["kind"] == "user"),
            "{name}: never a student row"
        );
        let head = replay
            .items
            .iter()
            .find(|i| i["id"] == run["initiating_item_id"])
            .unwrap();
        assert_eq!(head["kind"], "continuation", "{name}");
        assert_eq!(head["content"], "Sync finished — continuing", "{name}");
        let answer = replay
            .items
            .iter()
            .find(|i| i["id"] == run["answer_item_id"])
            .unwrap_or_else(|| panic!("{name}: the run has an answer"));
        assert_eq!(answer["kind"], "assistant");
        assert_eq!(answer["run_id"], run["id"]);
        assert!(!answer["content"].as_str().unwrap().is_empty());
        // The webview heard the continuation and its run's settlement.
        let events: Vec<&str> = replay
            .envelopes
            .iter()
            .map(|e| e["event"]["type"].as_str().unwrap())
            .collect();
        assert!(events.contains(&"continued"), "{name}: {events:?}");
        assert!(events.contains(&"run_settled"), "{name}");
        // The provider was sent the card's prompt, the follow-up included.
        assert!(
            replay.outbound.iter().any(|f| f.to_string().contains(THEN)),
            "{name}"
        );
        assert!(!replay.busy, "{name}: the thread is free again");
    }
}
