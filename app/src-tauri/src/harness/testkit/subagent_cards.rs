//! The Subagent card (`app/proposal_jobs/subagent.rs`): its brief runs a
//! child and the report is the job's result on every bridge; the parent's
//! continuation carries that report on every bridge, even when a sibling's
//! continuation told it first; several cards' continuations queue one after
//! another; a rewind past a running card stops its child, whose run ends
//! interrupted with no continuation, and leaves the child's chat.

use serde_json::json;

use crate::harness::app::children::{self, Status};
use crate::harness::app::proposal_jobs::subagent;
use crate::harness::app::BusMsg;
use crate::harness::core::Kind;
use crate::harness::{HarnessEvent, Provider};

use super::children::{feed, named, reported, waiting};
use super::commands::{ended, Bench};
use super::continuation::{card, REPORT, SIBLING_REPORT};
use super::replay::run;
use super::rig::Rig;
use super::scenario::Scenario;

/// A card as the student left it: the agent's task, and the selection.
fn card_state(provider: &str, model: &str) -> serde_json::Value {
    json!({"title": "Replay", "task": super::outbound::REQUEST, "provider": provider,
           "model": model, "effort": null, "then": "Use the report"})
}

#[test]
fn a_cards_brief_runs_its_child_and_the_report_is_the_result_on_every_bridge() {
    for name in [
        "claude-ls",
        "codex-ls",
        "opencode-v1-ls",
        "antigravity-acp-ls",
    ] {
        let (scenario, model) = named(name);
        let frames = scenario.frames.clone();
        let mut rig = Rig::start(scenario);
        let state = card_state(rig.provider.as_str(), model);
        let brief = subagent::brief(rig.thread, &state).unwrap();
        let (child, mut bridge) = rig.child("card", brief).unwrap();
        let wait = waiting(&rig, child);
        feed(&rig, &mut bridge, &frames);
        let report = reported(&rig, wait);
        assert_eq!(report.status, Status::Completed, "{name}");
        let answer = report.answer.clone().expect("an answer");
        assert_eq!(subagent::outcome(report), Ok(answer), "{name}");
        rig.finish();
    }
}

#[test]
fn a_finished_card_continues_its_parent_with_the_report_on_every_bridge() {
    for name in [
        "claude-ls",
        "codex-ls",
        "opencode-v1-ls",
        "antigravity-acp-ls",
    ] {
        let mut scenario = Scenario::recorded(name);
        scenario.continuation = true;
        scenario.subagent_card = true;
        let replay = run(scenario);
        assert_eq!(replay.continuations.len(), 1, "{name}");
        let head = replay
            .items
            .iter()
            .find(|i| i["kind"] == "continuation")
            .unwrap_or_else(|| panic!("{name}: a continuation row"));
        assert_eq!(head["content"], "Subagent finished — continuing", "{name}");
        assert!(
            !replay.items.iter().any(|i| i["kind"] == "user"),
            "{name}: never a student row"
        );
        // The provider was told the report, under Cards in this thread.
        let sent = replay
            .outbound
            .iter()
            .map(|f| f.to_string())
            .collect::<String>();
        assert!(sent.contains("Cards in this thread"), "{name}");
        assert!(sent.contains(REPORT), "{name}");
        assert!(!replay.busy, "{name}: the thread is free again");
    }
}

/// Two cards finished while the parent was busy and the first one's
/// continuation told both: the second's continuation still sends its own
/// report, and not the sibling's again.
#[test]
fn a_continuation_sends_its_own_report_after_a_sibling_told_it_on_every_bridge() {
    for name in [
        "claude-ls",
        "codex-ls",
        "opencode-v1-ls",
        "antigravity-acp-ls",
    ] {
        let mut scenario = Scenario::recorded(name);
        scenario.continuation = true;
        scenario.subagent_card = true;
        scenario.already_told = true;
        let replay = run(scenario);
        assert_eq!(replay.continuations.len(), 1, "{name}");
        let sent = replay
            .outbound
            .iter()
            .map(|f| f.to_string())
            .collect::<String>();
        assert!(sent.contains(REPORT), "{name}: its own report");
        assert!(!sent.contains(SIBLING_REPORT), "{name}: told once");
    }
}

/// A finished Subagent card with a follow-up, on the bench's thread.
fn finished(bench: &Bench, report: &str) -> String {
    let state = json!({
        "title": "Part", "task": "Make a part", "provider": "claude", "model": "sonnet",
        "then": "Put the parts together",
        "job": {"phase": "complete", "started_at": "2026-11-08T01:00:00Z", "child": 9,
                "ended": "completed", "result": report},
    });
    let seeded = card(&bench.pool, bench.thread, "Subagent", "created", &state);
    bench.runtime.block_on(seeded)
}

/// Three children end while the parent answers: each card's end queues its
/// own continuation, and they go out one after another, none lost.
#[test]
fn several_cards_continue_one_after_another_and_none_is_lost() {
    let mut bench = Bench::new("subagent-cards-queue");
    let cards: Vec<String> = ["first", "second", "third"]
        .iter()
        .map(|r| finished(&bench, r))
        .collect();
    let settled = |bench: &Bench, card: &str| {
        bench.app(HarnessEvent::CardSettled {
            proposal: card.into(),
        })
    };
    let (turn, _) = bench.send("c1", "go");
    let mut script = vec![turn];
    // Each child's end, in two views, while the parent's turn runs.
    for card in &cards {
        script.push(settled(&bench, card));
        script.push(settled(&bench, card));
    }
    bench.play(script);
    assert_eq!(
        bench.starts().len(),
        1,
        "the parent's turn keeps the thread"
    );
    assert_eq!(
        bench.count(
            "SELECT COUNT(*) FROM harness_runs WHERE execution_status = 'queued' AND origin = 'continuation'"
        ),
        3,
        "one waiting run per card"
    );
    for (n, card) in cards.iter().enumerate() {
        bench.play(vec![bench.app(ended("completed"))]);
        let starts = bench.starts();
        assert_eq!(starts.len(), n + 2, "one more after each turn ends");
        let start = starts.last().unwrap();
        assert_eq!(start.text, "Subagent finished — continuing");
        assert_eq!(start.options.continuation.as_deref(), Some(card.as_str()));
    }
    bench.play(vec![bench.app(ended("completed"))]);
    assert_eq!(bench.starts().len(), 4, "no more than one each");
    for card in &cards {
        let state = bench
            .runtime
            .block_on(crate::db::proposals::get(&bench.pool, card))
            .unwrap()
            .state;
        assert_eq!(state["continuation"]["phase"], "started", "{card}");
    }
}

/// Rewinding the parent past a card whose child runs stops the child's run;
/// the child's chat stays, as a chat of its own.
#[test]
fn a_rewind_past_a_running_card_stops_its_child() {
    let mut bench = Bench::new("subagent-cards-rewind");
    let parent = bench.thread;
    bench.play(bench.turn("t1", "question", "anchor-1"));
    let (question, reply): (i64, i64) = bench
        .runtime
        .block_on(
            sqlx::query_as(
                "SELECT (SELECT id FROM harness_items WHERE kind = 'user'),
                        (SELECT id FROM harness_items WHERE kind = 'assistant')",
            )
            .fetch_one(&bench.pool),
        )
        .unwrap();

    // The card's child, started through the command path.
    let brief = subagent::brief(parent, &card_state("claude", "sonnet")).unwrap();
    let start = children::command(&bench.pool, "child", brief);
    let command = bench.runtime.block_on(start).unwrap();
    let (reply_to, answer) = tokio::sync::oneshot::channel();
    bench.play(vec![BusMsg::Command {
        command,
        reply: reply_to,
    }]);
    let child = bench.got(answer).unwrap().thread_id;
    assert_ne!(child, parent);
    let child_run: i64 = bench
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT id FROM harness_runs WHERE thread_id = ?1")
                .bind(child)
                .fetch_one(&bench.pool),
        )
        .unwrap();
    // A card that would continue its parent, were it still there.
    let state = json!({"title": "Part", "task": "Make a part", "provider": "claude",
                       "model": "sonnet", "then": "Put the parts together",
                       "job": {"phase": "running", "child": child}});
    let seeded = sqlx::query("INSERT INTO chat_proposals (item_id, block, thread_id, kind, status, state, initial_state) VALUES (?1, 0, ?2, 'Subagent', 'created', ?3, ?3)")
        .bind(reply)
        .bind(parent)
        .bind(state.to_string())
        .execute(&bench.pool);
    bench.runtime.block_on(seeded).unwrap();

    let (rewind, answer) = bench.command("rewind", Kind::Rewind { item_id: question });
    bench.play(vec![rewind]);
    bench.got(answer).unwrap();
    let stopped = bench
        .events()
        .iter()
        .any(|e| e["threadId"] == child && e["event"]["type"] == "stop_requested");
    assert!(stopped, "the child's run was asked to stop");
    assert_eq!(bench.count("SELECT COUNT(*) FROM chat_proposals"), 0);

    // The child's own run ends interrupted on the stop, and its report says so.
    let starts = bench.starts().len();
    bench.play(vec![BusMsg::app(
        child,
        Provider::Claude,
        ended("interrupted"),
    )]);
    let ended_as: String = bench
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT execution_status FROM harness_runs WHERE id = ?1")
                .bind(child_run)
                .fetch_one(&bench.pool),
        )
        .unwrap();
    assert_eq!(ended_as, "interrupted");
    let report = bench
        .runtime
        .block_on(children::report(&bench.pool, child))
        .unwrap()
        .expect("the child's first run ended");
    assert_eq!(report.status, Status::Interrupted);

    // The job's finish writes the stop onto a card that is gone, then
    // settles it, which continues nothing.
    let finish = sqlx::query(
        "UPDATE chat_proposals SET state = json_set(state, '$.job.phase', 'error',
                '$.job.ended', 'interrupted') WHERE item_id = ?1",
    )
    .bind(reply)
    .execute(&bench.pool);
    bench.runtime.block_on(finish).unwrap();
    bench.play(vec![bench.app(HarnessEvent::CardSettled {
        proposal: format!("{reply}.0"),
    })]);
    assert_eq!(
        bench.count("SELECT COUNT(*) FROM harness_runs WHERE origin = 'continuation'"),
        0,
        "no continuation"
    );
    assert_eq!(bench.starts().len(), starts, "nothing more goes out");
    let kept: i64 = bench
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT COUNT(*) FROM harness_items WHERE thread_id = ?1")
                .bind(child)
                .fetch_one(&bench.pool),
        )
        .unwrap();
    assert!(kept > 0, "the child's chat stays");
}
