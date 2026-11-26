use std::sync::Arc;

use sqlx::SqlitePool;

use crate::harness::core::Kind;
use crate::harness::store::{APP_CLOSED, NO_ANSWER};
use crate::harness::Provider;

use super::*;

async fn pool() -> SqlitePool {
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    for migration in crate::db::migrations::all() {
        sqlx::raw_sql(migration.sql).execute(&pool).await.unwrap();
    }
    // 1 is a chat under subject 7 that asks in Auto; 2 is its child.
    sqlx::raw_sql(
        "INSERT INTO subjects (id, code, name) VALUES (7, 'COMP30026', 'Models');
         INSERT INTO harness_threads (id, provider, subject_id, permission_mode) VALUES (1, 'codex', 7, 'auto');
         INSERT INTO harness_threads (id, provider, parent_thread_id) VALUES (2, 'claude', 1);
         INSERT INTO harness_bindings (id, thread_id, provider) VALUES (1, 2, 'claude');",
    )
    .execute(&pool)
    .await
    .unwrap();
    pool
}

/// A run of the child, its answer row and the rows that say how it ended.
async fn run(
    pool: &SqlitePool,
    id: i64,
    status: &str,
    answer: Option<&str>,
    said: &[(&str, &str)],
) {
    sqlx::query(
        "INSERT INTO harness_runs (id, thread_id, ordinal, origin, binding_id, execution_status)
         VALUES (?1, 2, ?1, 'student', 1, ?2)",
    )
    .bind(id)
    .bind(status)
    .execute(pool)
    .await
    .unwrap();
    if let Some(text) = answer {
        let item = sqlx::query(
            "INSERT INTO harness_items (thread_id, kind, content, run_id) VALUES (2, 'assistant', ?1, ?2)",
        )
        .bind(text)
        .bind(id)
        .execute(pool)
        .await
        .unwrap()
        .last_insert_rowid();
        sqlx::query("UPDATE harness_runs SET answer_item_id = ?2 WHERE id = ?1")
            .bind(id)
            .bind(item)
            .execute(pool)
            .await
            .unwrap();
    }
    for (kind, text) in said {
        sqlx::query(
            "INSERT INTO harness_items (thread_id, kind, content, run_id) VALUES (2, ?1, ?2, ?3)",
        )
        .bind(kind)
        .bind(text)
        .bind(id)
        .execute(pool)
        .await
        .unwrap();
    }
}

fn brief(parent: i64) -> Brief {
    Brief {
        parent,
        text: "Summarise week 3".into(),
        provider: Provider::Claude,
        model: "sonnet".into(),
        effort: Some("medium".into()),
    }
}

#[tokio::test]
async fn a_child_is_sent_with_its_parents_subject_and_mode_and_names_it() {
    let pool = pool().await;
    let command = command(&pool, "c1", brief(1)).await.unwrap();
    assert_eq!(command.id, "c1");
    assert_eq!(command.thread_id, None, "a thread of its own");
    let Kind::Send {
        provider,
        text,
        options,
        ..
    } = command.kind
    else {
        panic!("a child starts with a send");
    };
    assert_eq!(provider, Provider::Claude);
    assert_eq!(text, "Summarise week 3");
    assert_eq!(options.model.as_deref(), Some("sonnet"));
    assert_eq!(options.reasoning_effort.as_deref(), Some("medium"));
    assert_eq!(options.subject_id, Some(7));
    assert_eq!(
        options.start_mode,
        Some(crate::harness::requests::PermissionMode::Auto)
    );
    assert_eq!(options.parent_thread_id, Some(1));
}

#[tokio::test]
async fn a_child_cannot_start_a_child_and_nothing_starts_for_a_missing_chat() {
    let pool = pool().await;
    let refused = command(&pool, "c1", brief(2)).await.err();
    assert_eq!(refused.as_deref(), Some(ONE_LEVEL));
    assert!(command(&pool, "c2", brief(9)).await.is_err());
    let mut bad = brief(1);
    bad.effort = Some("--model".into());
    assert!(command(&pool, "c3", bad).await.is_err());
}

#[tokio::test]
async fn the_report_is_the_first_runs_answer_and_later_runs_never_change_it() {
    let pool = pool().await;
    // The brief's run is written with the thread: none means it was taken back.
    let rewound = report(&pool, 2).await.unwrap().unwrap();
    assert_eq!(rewound.status, Status::Interrupted);
    run(&pool, 1, "running", None, &[]).await;
    assert_eq!(report(&pool, 2).await.unwrap(), None, "still open");
    sqlx::query("UPDATE harness_runs SET execution_status = 'completed' WHERE id = 1")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO harness_items (id, thread_id, kind, content, run_id) VALUES (50, 2, 'assistant', 'Week 3 is about DFAs.', 1);
         UPDATE harness_runs SET answer_item_id = 50 WHERE id = 1;",
    )
    .execute(&pool)
    .await
    .unwrap();
    let first = Report {
        status: Status::Completed,
        answer: Some("Week 3 is about DFAs.".into()),
        reason: None,
    };
    assert_eq!(report(&pool, 2).await.unwrap(), Some(first.clone()));
    // The student goes on in the child's chat; its report stays the brief's.
    run(&pool, 2, "failed", Some("Other"), &[("error", "boom")]).await;
    assert_eq!(report(&pool, 2).await.unwrap(), Some(first));
}

/// A run's status, its answer and the rows that say how it ended.
type Ending<'a> = (&'a str, Option<&'a str>, &'a [(&'a str, &'a str)]);

#[tokio::test]
async fn each_ending_reports_its_reason() {
    let cases: [(Ending, Report); 5] = [
        (
            ("completed", None, &[("delivery_notice", NO_ANSWER)]),
            Report {
                status: Status::Completed,
                answer: None,
                reason: Some(super::report::NO_REPORT.into()),
            },
        ),
        (
            ("failed", None, &[("error", "Claude is signed out.")]),
            Report {
                status: Status::Failed,
                answer: None,
                reason: Some("Claude is signed out.".into()),
            },
        ),
        (
            ("interrupted", Some("Half"), &[]),
            Report {
                status: Status::Interrupted,
                answer: Some("Half".into()),
                reason: Some("The subagent was stopped before it finished.".into()),
            },
        ),
        (
            (
                "interrupted",
                Some("Half"),
                &[("delivery_notice", APP_CLOSED)],
            ),
            Report {
                status: Status::Interrupted,
                answer: Some("Half".into()),
                reason: Some(APP_CLOSED.into()),
            },
        ),
        (
            ("cancelled", None, &[]),
            Report {
                status: Status::Interrupted,
                answer: None,
                reason: Some(
                    "The subagent's brief was taken out of its queue before it started.".into(),
                ),
            },
        ),
    ];
    for ((status, answer, said), expected) in cases {
        let pool = pool().await;
        run(&pool, 1, status, answer, said).await;
        assert_eq!(report(&pool, 2).await.unwrap(), Some(expected), "{status}");
    }
    // A completed run whose answer was lost on the way says so.
    let gapped = pool().await;
    let notice: &[(&str, &str)] = &[("delivery_notice", NO_ANSWER)];
    run(&gapped, 1, "completed", None, notice).await;
    sqlx::query("INSERT INTO harness_delivery_gaps (thread_id, run_id, cause) VALUES (2, 1, 'missing_text')")
        .execute(&gapped)
        .await
        .unwrap();
    let lost = report(&gapped, 2).await.unwrap().unwrap();
    assert_eq!(lost.reason.as_deref(), Some(NO_ANSWER));
    // A gap with no notice row is still a lost answer, not a missing report.
    let unnoticed = pool().await;
    run(&unnoticed, 1, "completed", None, &[]).await;
    sqlx::query("INSERT INTO harness_delivery_gaps (thread_id, run_id, cause) VALUES (2, 1, 'missing_text')")
        .execute(&unnoticed)
        .await
        .unwrap();
    let lost = report(&unnoticed, 2).await.unwrap().unwrap();
    assert_eq!(lost.reason.as_deref(), Some(NO_ANSWER));
    // A specific diagnostic the run left beats a later generic notice.
    let specific = pool().await;
    let said: &[(&str, &str)] = &[
        ("error", "Claude's reply was cut off by its output limit."),
        ("delivery_notice", NO_ANSWER),
    ];
    run(&specific, 1, "completed", None, said).await;
    sqlx::query("INSERT INTO harness_delivery_gaps (thread_id, run_id, cause) VALUES (2, 1, 'missing_text')")
        .execute(&specific)
        .await
        .unwrap();
    let cut = report(&specific, 2).await.unwrap().unwrap();
    assert_eq!(
        cut.reason.as_deref(),
        Some("Claude's reply was cut off by its output limit.")
    );
    // A brief a quit caught before it was sent waits held in the queue.
    let pool = pool().await;
    run(&pool, 1, "queued", None, &[]).await;
    assert_eq!(report(&pool, 2).await.unwrap(), None, "going out");
    sqlx::query("UPDATE harness_runs SET queue_held = 1")
        .execute(&pool)
        .await
        .unwrap();
    let held = report(&pool, 2).await.unwrap().unwrap();
    assert_eq!(held.status, Status::Interrupted);
    // A deleted child reports rather than leaving its parent waiting.
    crate::harness::store::delete_thread(&pool, 2)
        .await
        .unwrap();
    let gone = report(&pool, 2).await.unwrap().unwrap();
    assert_eq!(gone.status, Status::Interrupted);
    assert_eq!(
        gone.reason.as_deref(),
        Some("The subagent's chat was deleted.")
    );
}

#[tokio::test]
async fn a_wait_wakes_when_the_run_settles_and_a_settled_run_answers_at_once() {
    let pool = pool().await;
    run(&pool, 1, "running", None, &[]).await;
    let waiters = Arc::new(Waiters::default());
    let waiting = {
        let (pool, waiters) = (pool.clone(), waiters.clone());
        tokio::spawn(async move { wait_on(&pool, &waiters, 2).await })
    };
    while waiters.waiting(2) == 0 {
        tokio::task::yield_now().await;
    }
    // A wake with the run still open looks, and waits again.
    waiters.ended(2);
    while waiters.waiting(2) == 0 {
        tokio::task::yield_now().await;
    }
    assert!(!waiting.is_finished());
    sqlx::query("UPDATE harness_runs SET execution_status = 'interrupted' WHERE id = 1")
        .execute(&pool)
        .await
        .unwrap();
    waiters.ended(2);
    let report = waiting.await.unwrap().unwrap();
    assert_eq!(report.status, Status::Interrupted);
    assert_eq!(waiters.waiting(2), 0, "woken waits are let go");
    // Over already: it answers with no wake, and leaves nothing waiting.
    let again = wait_on(&pool, &waiters, 2).await.unwrap();
    assert_eq!(again, report);
    assert_eq!(waiters.waiting(2), 0);
    assert_eq!(waiters.registered(2), 0, "a returned wait keeps no wake");
}
