use serde::Serialize;
use sqlx::{Row, SqlitePool};

/// How a child's first run ended.
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Completed,
    Interrupted,
    Failed,
}

/// What a child reports to its parent: the answer `store::settle_run` chose
/// for its first run, or why there is none, fit to show.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub status: Status,
    /// The run's answer; for a stopped or failed run, what had arrived.
    pub answer: Option<String>,
    /// Why the run did not complete, or why a completed one has no answer.
    pub reason: Option<String>,
}

const DELETED: &str = "The subagent's chat was deleted.";
const REWOUND: &str = "The subagent's chat was taken back past its brief.";
const NOT_STARTED: &str = "Oculus closed before the subagent started.";
const REMOVED: &str = "The subagent's brief was taken out of its queue before it started.";
const STOPPED: &str = "The subagent was stopped before it finished.";
const FAILED: &str = "The subagent stopped with an error.";
/// A completed run that wrote no closing text, with nothing lost on the way.
pub(in crate::harness) const NO_REPORT: &str =
    "The subagent finished without a report. Open its chat to see what it did.";

/// The child's first run: the one its brief started.
pub(in crate::harness) async fn first_run(
    pool: &SqlitePool,
    child: i64,
) -> Result<Option<i64>, String> {
    sqlx::query_scalar(
        "SELECT id FROM harness_runs WHERE thread_id = ?1 AND origin = 'student' ORDER BY id LIMIT 1",
    )
    .bind(child)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())
}

/// The child's report, or `None` while its first run is still open. Read
/// whole from the saved rows, so it is the same in any process: a child
/// deleted, rewound past its brief, or left unsent by a quit reports
/// `interrupted`.
pub(in crate::harness) async fn report(
    pool: &SqlitePool,
    child: i64,
) -> Result<Option<Report>, String> {
    // One read, so a delete cannot land between finding the thread and its
    // first run. The run's own last word on how it ended: its error row, or
    // the notice a completed run without its answer, or a quit, left; and
    // its newest one that says more than `NO_ANSWER`.
    let row = sqlx::query(
        "SELECT t.id AS thread, r.id AS run, r.execution_status, r.queue_held,
                a.content AS answer,
                (SELECT o.content FROM harness_items o
                  WHERE o.run_id = r.id AND o.kind IN ('error', 'delivery_notice')
                  ORDER BY o.id DESC LIMIT 1) AS said,
                (SELECT o.content FROM harness_items o
                  WHERE o.run_id = r.id AND o.kind IN ('error', 'delivery_notice')
                    AND o.content != ?2
                  ORDER BY o.id DESC LIMIT 1) AS specific,
                EXISTS (SELECT 1 FROM harness_delivery_gaps g
                         WHERE g.run_id = r.id AND g.state = 'unresolved') AS lost
           FROM (SELECT ?1 AS id) q
           LEFT JOIN harness_threads t ON t.id = q.id
           LEFT JOIN harness_runs r ON r.id = (SELECT f.id FROM harness_runs f
                                                WHERE f.thread_id = q.id AND f.origin = 'student'
                                                ORDER BY f.id LIMIT 1)
           LEFT JOIN harness_items a ON a.id = r.answer_item_id",
    )
    .bind(child)
    .bind(crate::harness::store::NO_ANSWER)
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())?;
    if row.get::<Option<i64>, _>("thread").is_none() {
        return Ok(Some(interrupted(None, DELETED)));
    }
    if row.get::<Option<i64>, _>("run").is_none() {
        return Ok(Some(interrupted(None, REWOUND)));
    }
    let answer = row
        .get::<Option<String>, _>("answer")
        .filter(|a| !a.trim().is_empty());
    let said: Option<String> = row.get("said");
    let specific: Option<String> = row.get("specific");
    let lost = row.get::<i64, _>("lost") != 0;
    let status: Option<String> = row.get("execution_status");
    let report = match status.as_deref().unwrap_or_default() {
        // `settle_run` writes `NO_ANSWER` for any completed run with no
        // answer; it is true only when an unresolved gap says text was lost.
        "completed" => Report {
            status: Status::Completed,
            reason: match &answer {
                Some(_) => None,
                None => Some(specific.unwrap_or_else(|| match lost {
                    true => crate::harness::store::NO_ANSWER.into(),
                    false => NO_REPORT.into(),
                })),
            },
            answer,
        },
        "interrupted" => interrupted(answer, &said.unwrap_or_else(|| STOPPED.into())),
        "failed" => Report {
            status: Status::Failed,
            answer,
            reason: Some(said.unwrap_or_else(|| FAILED.into())),
        },
        // A brief a quit caught before it was sent waits, held, in the
        // child's queue: nothing will send it unless the student does.
        "queued" if row.get::<Option<i64>, _>("queue_held").unwrap_or(0) != 0 => {
            interrupted(None, NOT_STARTED)
        }
        "cancelled" => interrupted(None, REMOVED),
        _ => return Ok(None),
    };
    Ok(Some(report))
}

fn interrupted(answer: Option<String>, reason: &str) -> Report {
    Report {
        status: Status::Interrupted,
        answer,
        reason: Some(reason.into()),
    }
}
