//! Subagents through the replay (`app/children`): a child chat started from
//! a parent reports its first run's answer on every bridge, is refused under
//! a child and outlives its parent; Stop, a shared server's force stop and a
//! quit each leave it reporting `interrupted`.

use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tokio::task::JoinHandle;

use crate::harness::app::children::{self, Brief, Report, Status, ONE_LEVEL};
use crate::harness::core::{Command, Kind};
use crate::harness::Provider;

use super::identity::as_turn;
use super::outbound::REQUEST;
use super::replay::Bridge;
use super::rig::Rig;
use super::scenario::Scenario;

/// A recording, with the model the child names written into the provider
/// call that carries it, where the replay sends one: the recordings were
/// made without naming a model.
pub(super) fn named(name: &str) -> (Scenario, &'static str) {
    let mut scenario = Scenario::recorded(name);
    let model = match scenario.fixture.provider {
        Provider::Claude => "claude-sonnet-5",
        Provider::Codex => "gpt-5.6-sol",
        Provider::Opencode => "openrouter/openai/gpt-4.1-mini",
        Provider::Antigravity => "gemini-3.8-flash-low",
    };
    // Codex names it on the turn; the others' replayed sessions hold it.
    if scenario.fixture.provider == Provider::Codex {
        scenario.fixture.expected_outbound[0].frame["params"]["model"] = model.into();
    }
    (scenario, model)
}

fn brief(rig: &Rig, model: &str) -> Brief {
    Brief {
        parent: rig.thread,
        text: REQUEST.into(),
        provider: rig.provider,
        model: model.into(),
        effort: None,
    }
}

/// The parent files under a subject, which its child takes.
fn under_subject(rig: &Rig) {
    let seeded = sqlx::raw_sql(
        "INSERT INTO subjects (id, code, name) VALUES (7, 'COMP30026', 'Models');
         UPDATE harness_threads SET subject_id = 7;",
    )
    .execute(&rig.pool);
    rig.runtime.block_on(seeded).unwrap();
}

/// A wait on `child`'s report, registered before this returns.
pub(super) fn waiting(rig: &Rig, child: i64) -> JoinHandle<Result<Report, String>> {
    let (pool, waiters) = (rig.pool.clone(), rig.children.clone());
    let wait = rig
        .runtime
        .spawn(async move { children::wait_on(&pool, &waiters, child).await });
    let deadline = Instant::now() + Duration::from_secs(10);
    while rig.children.waiting(child) == 0 {
        assert!(Instant::now() < deadline, "the wait never registered");
        std::thread::sleep(Duration::from_millis(1));
    }
    wait
}

pub(super) fn reported(rig: &Rig, wait: JoinHandle<Result<Report, String>>) -> Report {
    let within = async { tokio::time::timeout(Duration::from_secs(10), wait).await };
    rig.runtime
        .block_on(within)
        .expect("the wait resolved")
        .unwrap()
        .unwrap()
}

pub(super) fn feed(rig: &Rig, bridge: &mut Bridge, frames: &[Value]) {
    for frame in frames {
        (bridge.inbound)(frame);
    }
    rig.drain();
}

fn scalar<T>(rig: &Rig, sql: &str, id: i64) -> T
where
    T: for<'r> sqlx::Decode<'r, sqlx::Sqlite> + sqlx::Type<sqlx::Sqlite> + Send + Unpin,
{
    let read = sqlx::query_scalar(sql).bind(id).fetch_one(&rig.pool);
    rig.runtime.block_on(read).unwrap()
}

fn command(rig: &mut Rig, id: &str, thread: i64, kind: Kind) {
    let done = rig.command(Command {
        id: id.into(),
        thread_id: Some(thread),
        kind,
    });
    done.unwrap();
}

/// On every bridge: the child is a thread of its own under the parent's
/// subject and mode, its first row is the parent's brief, and its wait
/// returns the answer `settle_run` chose, as `completed`.
#[test]
fn a_child_reports_its_answer_on_every_bridge() {
    for name in [
        "claude-ls",
        "codex-ls",
        "opencode-v1-ls",
        "antigravity-acp-ls",
    ] {
        let (scenario, model) = named(name);
        let frames = scenario.frames.clone();
        let mut rig = Rig::start(scenario);
        under_subject(&rig);
        let parent = rig.thread;
        let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
        assert_ne!(child, parent, "{name}");
        let wait = waiting(&rig, child);
        feed(&rig, &mut bridge, &frames);
        let report = reported(&rig, wait);

        let answer: Option<String> = scalar(
            &rig,
            "SELECT i.content FROM harness_runs r JOIN harness_items i ON i.id = r.answer_item_id
              WHERE r.thread_id = ?1",
            child,
        );
        assert_eq!(report.status, Status::Completed, "{name}: {report:?}");
        assert!(answer.as_ref().is_some_and(|a| !a.is_empty()), "{name}");
        assert_eq!(report.answer, answer, "{name}");
        assert_eq!(report.reason, None, "{name}");

        // The parent's subject and mode, the named model, its own session.
        let row: (Option<i64>, Option<i64>, String, Option<String>) = rig
            .runtime
            .block_on(
                sqlx::query_as(
                    "SELECT parent_thread_id, subject_id, permission_mode, model
                       FROM harness_threads WHERE id = ?1",
                )
                .bind(child)
                .fetch_one(&rig.pool),
            )
            .unwrap();
        let mode: String = scalar(
            &rig,
            "SELECT permission_mode FROM harness_threads WHERE id = ?1",
            parent,
        );
        assert_eq!(
            row,
            (Some(parent), Some(7), mode, Some(model.into())),
            "{name}"
        );
        let run_model: Option<String> = scalar(
            &rig,
            "SELECT model FROM harness_runs WHERE thread_id = ?1",
            child,
        );
        assert_eq!(run_model.as_deref(), Some(model), "{name}");
        let sessions: i64 = scalar(
            &rig,
            "SELECT COUNT(*) FROM harness_bindings WHERE thread_id = ?1",
            child,
        );
        assert_eq!(sessions, 1, "{name}");
        for table in ["harness_bindings", "harness_runs", "harness_items"] {
            let parents: i64 = scalar(
                &rig,
                &format!("SELECT COUNT(*) FROM {table} WHERE thread_id = ?1"),
                parent,
            );
            assert_eq!(parents, 0, "{name}: the parent's {table} are untouched");
        }

        // The brief is the parent's, on its row and as the webview hears it.
        let (kind, content, meta): (String, String, String) = rig
            .runtime
            .block_on(
                sqlx::query_as(
                    "SELECT kind, content, meta FROM harness_items WHERE thread_id = ?1 ORDER BY id LIMIT 1",
                )
                .bind(child)
                .fetch_one(&rig.pool),
            )
            .unwrap();
        assert_eq!(
            (kind.as_str(), content.as_str()),
            ("user", REQUEST),
            "{name}"
        );
        let meta: Value = serde_json::from_str(&meta).unwrap();
        assert_eq!(meta["fromThread"], parent, "{name}");
        let told = rig.envelopes();
        let asked = told
            .iter()
            .find(|e| e["threadId"] == child && e["event"]["type"] == "user_message")
            .unwrap();
        assert_eq!(asked["event"]["from_thread"], parent, "{name}");
        rig.finish();
    }
}

/// A child cannot start a child of its own; deleting the parent leaves the
/// child as a chat of its own, which still reports.
#[test]
fn a_child_is_one_level_deep_and_outlives_its_parent() {
    let (scenario, model) = named("claude-ls");
    let frames = scenario.frames.clone();
    let mut rig = Rig::start(scenario);
    let parent = rig.thread;
    let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
    feed(&rig, &mut bridge, &frames);

    let threads =
        |rig: &Rig| -> i64 { scalar(rig, "SELECT COUNT(*) FROM harness_threads WHERE id > ?1", 0) };
    let before = threads(&rig);
    let mut grandchild = brief(&rig, model);
    grandchild.parent = child;
    let refused = rig.child("grandchild", grandchild).err();
    assert_eq!(refused.as_deref(), Some(ONE_LEVEL));
    assert_eq!(threads(&rig), before, "nothing was made");

    command(&mut rig, "delete", parent, Kind::DeleteThread);
    let orphan: Option<i64> = scalar(
        &rig,
        "SELECT parent_thread_id FROM harness_threads WHERE id = ?1",
        child,
    );
    assert_eq!(orphan, None, "an ordinary chat now");
    let items: i64 = scalar(
        &rig,
        "SELECT COUNT(*) FROM harness_items WHERE thread_id = ?1",
        child,
    );
    assert!(items > 1, "its chat is kept");
    let report = reported(&rig, waiting_or_done(&rig, child));
    assert_eq!(report.status, Status::Completed);
    rig.finish();
}

/// A wait on a child that may be over already.
fn waiting_or_done(rig: &Rig, child: i64) -> JoinHandle<Result<Report, String>> {
    let (pool, waiters) = (rig.pool.clone(), rig.children.clone());
    rig.runtime
        .spawn(async move { children::wait_on(&pool, &waiters, child).await })
}

/// Stop on the child's run asks Codex to interrupt it; the turn's own
/// terminal settles it, and the wait reports `interrupted`.
#[test]
fn stopping_a_child_reports_it_interrupted() {
    const THREAD: &str = "01a09ebd-3374-7100-bb0f-c42308e70fba";
    const TURN: &str = "01a09ebd-33de-7d00-825b-ed4c057a5347";
    let mut scenario = Scenario::recorded("codex-interrupt");
    let model = "gpt-5.6-sol";
    scenario.fixture.expected_outbound[0].frame["params"]["model"] = model.into();
    let mut interrupt = scenario.fixture.expected_outbound[0].clone();
    interrupt.frame = json!({
        "jsonrpc": "2.0", "id": 2, "method": "turn/interrupt",
        "params": {"threadId": THREAD, "turnId": TURN},
    });
    interrupt.response = json!({});
    scenario.fixture.expected_outbound.push(interrupt);
    let frames = scenario.frames.clone();
    let ends = frames
        .iter()
        .position(|f| f["method"] == "turn/completed")
        .unwrap();
    let mut rig = Rig::start(scenario);
    let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
    feed(&rig, &mut bridge, &frames[..ends]);
    let wait = waiting(&rig, child);

    let stop = rig
        .runtime
        .block_on(children::stop_command(&rig.pool, "stop", child))
        .unwrap()
        .expect("the child has a run to stop");
    rig.command(stop).unwrap();
    assert!(!wait.is_finished(), "the turn ends by its own terminal");
    feed(&rig, &mut bridge, &frames[ends..]);
    let report = reported(&rig, wait);
    assert_eq!(report.status, Status::Interrupted, "{report:?}");
    assert!(report.reason.is_some());
    rig.finish();
}

/// Codex answers every chat from one server: a force stop of another chat
/// ends the child's turn too, and its wait reports rather than hangs.
#[test]
fn a_shared_server_ending_under_a_child_reports_it_interrupted() {
    const FIRST: &str = "01a08b4a-5f68-7c42-bc82-ab8e70d37d01";
    let (scenario, model) = named("codex-ls");
    let mut scenario = scenario.gate("terminal", |f| f["method"] == "turn/completed");
    // The parent's own run goes out as recorded; the child's names its model.
    let mut theirs = scenario.fixture.expected_outbound[0].clone();
    theirs.response["turn"]["id"] = "child-turn".into();
    let ours = &mut scenario.fixture.expected_outbound[0];
    ours.frame["params"]
        .as_object_mut()
        .unwrap()
        .remove("model");
    scenario.fixture.expected_outbound.push(theirs);
    let frames = scenario.frames.clone();
    let ends = frames
        .iter()
        .position(|f| f["method"] == "turn/completed")
        .unwrap();
    let mut rig = Rig::start(scenario);
    rig.open();
    rig.until("terminal");
    let parent = rig.thread;
    let stuck: i64 = scalar(
        &rig,
        "SELECT id FROM harness_runs WHERE thread_id = ?1",
        parent,
    );

    let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
    feed(
        &rig,
        &mut bridge,
        &as_turn(&frames, FIRST, "child-turn")[..ends],
    );
    let wait = waiting(&rig, child);

    command(&mut rig, "force", parent, Kind::ForceStop { run_id: stuck });
    let report = reported(&rig, wait);
    assert_eq!(report.status, Status::Interrupted, "{report:?}");
    assert!(!bridge.handle.is_alive(), "the server is gone");
    rig.finish();
}

/// A quit mid-run: after the next launch's repair nothing waits, and the
/// child's wait reports `interrupted` at once, with what had arrived.
#[test]
fn a_child_left_running_by_a_quit_reports_interrupted_after_launch() {
    let (scenario, model) = named("claude-ls");
    let frames = scenario.frames.clone();
    let ends = frames.iter().position(|f| f["type"] == "result").unwrap();
    let mut rig = Rig::start(scenario);
    let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
    feed(&rig, &mut bridge, &frames[..ends]);
    let status: String = scalar(
        &rig,
        "SELECT execution_status FROM harness_runs WHERE thread_id = ?1",
        child,
    );
    assert_eq!(status, "running");

    let rig = rig.restart();
    assert_eq!(
        rig.children.waiting(child),
        0,
        "waits do not survive a quit"
    );
    rig.startup().unwrap();
    let report = reported(&rig, waiting_or_done(&rig, child));
    assert_eq!(report.status, Status::Interrupted, "{report:?}");
    assert_eq!(
        report.reason.as_deref(),
        Some(crate::harness::store::APP_CLOSED)
    );
    assert_eq!(rig.children.waiting(child), 0, "nothing waits on it");
    rig.finish();
}
