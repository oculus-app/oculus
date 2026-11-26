use serde_json::json;
use std::time::Duration;

use crate::harness::app::children::{self, Brief, Report, Status};
use crate::harness::app::proposal_jobs::{lifecycle::replay, subagent};
use crate::harness::core::{Command, Kind};
use crate::harness::{Provider, SendError};

use super::children::{feed, named, reported, waiting};
use super::continuation::card;
use super::outbound::REQUEST;
use super::rig::Rig;

pub(super) fn brief(rig: &Rig, model: &str) -> Brief {
    Brief {
        parent: rig.thread,
        text: REQUEST.into(),
        provider: rig.provider,
        model: model.into(),
        effort: None,
    }
}

fn settled(rig: &Rig, child: i64) -> Report {
    rig.runtime.block_on(async {
        tokio::time::timeout(
            Duration::from_secs(5),
            children::wait_on(&rig.pool, &rig.children, child),
        )
        .await
        .expect("the settled child still has a waiter")
        .unwrap()
    })
}

#[test]
fn deleting_the_child_wakes_the_waiting_job() {
    let (scenario, model) = named("claude-ls");
    let mut rig = Rig::start(scenario);
    let (child, _bridge) = rig.child("start", brief(&rig, model)).unwrap();
    let wait = waiting(&rig, child);
    rig.command(Command {
        id: "delete-child".into(),
        thread_id: Some(child),
        kind: Kind::DeleteThread,
    })
    .unwrap();
    let report = reported(&rig, wait);
    assert_eq!(report.status, Status::Interrupted);
    assert_eq!(report.answer, None);
    assert_eq!(
        subagent::outcome(report).unwrap_err(),
        "The subagent's chat was deleted."
    );
    assert_eq!(rig.children.waiting(child), 0);
    rig.finish();
}

#[test]
fn a_failed_spawn_wakes_the_job_with_the_sign_in_reason() {
    const SIGN_IN: &str = "Sign in to Claude before starting this chat.";
    let (mut scenario, model) = named("claude-ls");
    scenario.fixture.expected_outbound.clear();
    let mut rig = Rig::start(scenario);
    let cmd = rig
        .runtime
        .block_on(children::command(&rig.pool, "start", brief(&rig, model)))
        .unwrap();
    rig.hold_effects();
    let child = rig.command(cmd).unwrap().thread_id;
    rig.harness
        .replay_spawn_result(child, rig.provider, |_, _| {
            Err(SendError::Unsent(SIGN_IN.into()))
        });
    let wait = waiting(&rig, child);
    rig.run_effects();
    let report = reported(&rig, wait);
    assert_eq!(report.status, Status::Failed);
    assert_eq!(report.answer, None);
    assert_eq!(subagent::outcome(report).unwrap_err(), SIGN_IN);
    assert!(rig.finish().outbound.is_empty());
}

#[test]
fn stopping_a_child_on_claude_opencode_and_antigravity_wakes_its_job() {
    for name in [
        "claude-interrupt",
        "opencode-v1-interrupt",
        "antigravity-acp-cancel-text",
    ] {
        let (mut scenario, model) = named(name);
        let provider = scenario.fixture.provider;
        let first_after_stop = scenario
            .frames
            .iter()
            .position(|f| match provider {
                Provider::Claude => f["type"] == "control_response",
                Provider::Opencode => f["type"] == "session.error",
                Provider::Antigravity => f["result"]["stopReason"] == "cancelled",
                Provider::Codex => unreachable!(),
            })
            .unwrap();
        let mut stop = scenario.fixture.expected_outbound[0].clone();
        match provider {
            Provider::Claude => {
                stop.frame = json!({"type":"control_request","request_id":"oculus-1","request":{"subtype":"interrupt"}})
            }
            Provider::Opencode => {
                stop.frame = json!({"method":"POST", "path":format!("/session/{}/abort?directory=$SCRATCH/agents", scenario.fixture.native_session),"body":null})
            }
            _ => {}
        }
        if provider != Provider::Antigravity {
            scenario.fixture.expected_outbound.push(stop);
        }
        let frames = scenario.frames.clone();
        let mut rig = Rig::start(scenario);
        let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
        feed(&rig, &mut bridge, &frames[..first_after_stop]);
        let wait = waiting(&rig, child);
        let stop = rig
            .runtime
            .block_on(children::stop_command(&rig.pool, "stop", child))
            .unwrap()
            .unwrap();
        rig.command(stop).unwrap();
        assert!(
            !wait.is_finished(),
            "{name}: the child's terminal has not arrived"
        );
        feed(&rig, &mut bridge, &frames[first_after_stop..]);
        let report = reported(&rig, wait);
        assert_eq!(report.status, Status::Interrupted, "{name}: {report:?}");
        assert!(
            !subagent::outcome(report).unwrap_err().trim().is_empty(),
            "{name}"
        );
        rig.finish();
    }
}

#[test]
fn a_quit_interrupts_codex_opencode_and_antigravity_children() {
    for name in ["codex-ls", "opencode-v1-ls", "antigravity-acp-cancel-text"] {
        let (mut scenario, model) = named(name);
        scenario.fixture.expected_outbound.truncate(1);
        let frame = scenario.frames[0].clone();
        let mut rig = Rig::start(scenario);
        let (child, mut bridge) = rig.child("start", brief(&rig, model)).unwrap();
        feed(&rig, &mut bridge, &[frame]);
        assert_eq!(
            rig.runtime
                .block_on(children::report(&rig.pool, child))
                .unwrap(),
            None,
            "{name}: running before quit"
        );
        let rig = rig.restart();
        rig.startup().unwrap();
        let report = settled(&rig, child);
        assert_eq!(report.status, Status::Interrupted, "{name}");
        assert_eq!(
            report.reason.as_deref(),
            Some(crate::harness::store::APP_CLOSED),
            "{name}"
        );
        assert_eq!(rig.children.waiting(child), 0);
        rig.finish();
    }
}

#[test]
fn starting_again_saves_the_second_childs_report_and_keeps_the_first_chat() {
    let (mut scenario, model) = named("claude-ls");
    scenario
        .fixture
        .expected_outbound
        .push(scenario.fixture.expected_outbound[0].clone());
    let frames = scenario.frames.clone();
    let mut rig = Rig::start(scenario);
    let input = json!({"title":"List files","task":REQUEST,"model":model,"provider":"claude","then":"Read the report"});
    let id = rig
        .runtime
        .block_on(card(&rig.pool, rig.thread, "Subagent", "pending", &input));
    let start = |rig: &mut Rig| {
        let state = rig.runtime.block_on(replay::claim_once(&rig.pool, &id));
        let receipt = format!(
            "subagent:{id}:{}",
            state["job"]["started_at"].as_str().unwrap()
        );
        let (child, bridge) = rig
            .child(&receipt, subagent::brief(rig.thread, &state).unwrap())
            .unwrap();
        assert!(rig
            .runtime
            .block_on(subagent::record(&rig.pool, &id, "child", child.into()))
            .unwrap());
        (child, bridge)
    };
    let (first, mut interrupted) = start(&mut rig);
    feed(&rig, &mut interrupted, &frames[..1]);
    let mut rig = rig.restart();
    rig.startup().unwrap();
    let (second, mut bridge) = start(&mut rig);
    assert_ne!(first, second);
    let wait = waiting(&rig, second);
    feed(&rig, &mut bridge, &frames);
    let report = reported(&rig, wait);
    assert_eq!(report.status, Status::Completed);
    let answer = report.answer.clone().expect("the recording's answer");
    assert!(!answer.trim().is_empty());
    rig.runtime.block_on(async {
        assert!(
            subagent::record(&rig.pool, &id, "ended", json!(report.status))
                .await
                .unwrap()
        );
        let saved = replay::finish_job(&rig.pool, &id, subagent::outcome(report)).await;
        assert_eq!(saved["job"]["result"], answer);
        assert_eq!(saved["job"]["child"], second);
        assert_eq!(saved["job"]["phase"], "complete");
        let old: (i64, String) = sqlx::query_as(
            "SELECT t.parent_thread_id, i.content FROM harness_threads t
             JOIN harness_items i ON i.thread_id = t.id WHERE t.id = ? AND i.kind = 'user'",
        )
        .bind(first)
        .fetch_one(&rig.pool)
        .await
        .unwrap();
        assert_eq!(old, (rig.thread, REQUEST.into()));
    });
    assert_eq!(settled(&rig, first).status, Status::Interrupted);
    rig.finish();
}

#[test]
fn deleting_a_child_during_the_report_read_still_reports_deletion() {
    let (scenario, model) = named("claude-ls");
    let mut rig = Rig::start(scenario);
    let (child, _bridge) = rig.child("start", brief(&rig, model)).unwrap();
    let report = rig.runtime.block_on(async {
        // The rig has one connection. Queue the waiter's read first, then the delete.
        let held = rig.pool.acquire().await.unwrap();
        let wait = children::wait_on(&rig.pool, &rig.children, child);
        let delete = crate::harness::store::delete_thread(&rig.pool, child);
        tokio::pin!(wait, delete);
        tokio::select! { biased; _ = &mut wait => panic!("the connection is held"), _ = std::future::ready(()) => {} }
        tokio::select! { biased; _ = &mut delete => panic!("the connection is held"), _ = std::future::ready(()) => {} }
        drop(held);
        let delete_and_wake = async {
            delete.await.unwrap();
            rig.children.ended(child);
        };
        let (report, ()) = tokio::time::timeout(Duration::from_secs(5), async {
            tokio::join!(wait, delete_and_wake)
        }).await.expect("the deleted child still has a waiter");
        report.unwrap()
    });
    rig.finish();
    assert_eq!(report.status, Status::Interrupted);
    assert_eq!(
        report.reason.as_deref(),
        Some("The subagent's chat was deleted.")
    );
}
