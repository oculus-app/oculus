//! Which cards a prompt lists follows the session it goes to
//! (`app/proposal_context.rs`): the frames each send writes to its
//! provider, as the replay records them.

use serde_json::json;

use crate::harness::core::{Command, Kind};
use crate::harness::{store, Provider, SendOptions};

use super::rig::{Recording, Rig};
use super::scenario::Scenario;

const REPORT: &str = "Week 3 covers DFAs";

/// Every send names the model, so the live session takes each as it is.
fn sonnet() -> SendOptions {
    SendOptions {
        model: Some("sonnet".into()),
        ..SendOptions::default()
    }
}

/// A decided Subagent card on the chat's newest reply, told by `told_by`
/// when given, and its id.
fn seed(rig: &Rig, report: &str, told_by: Option<i64>) -> String {
    let state = json!({"title": "Week 3", "task": "Summarise week 3",
        "job": {"phase": "complete", "result": report}});
    let block: i64 = rig
        .runtime
        .block_on(
            sqlx::query_scalar(
                "SELECT COUNT(*) FROM chat_proposals WHERE item_id =
                   (SELECT MAX(id) FROM harness_items WHERE thread_id = ?1 AND kind = 'assistant')",
            )
            .bind(rig.thread)
            .fetch_one(&rig.pool),
        )
        .unwrap();
    let item: i64 = rig
        .runtime
        .block_on(
            sqlx::query_scalar(
                "INSERT INTO chat_proposals (item_id, block, thread_id, kind, status, state, initial_state, told, told_run_id)
                 SELECT id, ?2, thread_id, 'Subagent', 'created', ?3, ?3,
                        CASE WHEN ?4 IS NULL THEN NULL ELSE 'created' END, ?4
                   FROM harness_items WHERE thread_id = ?1 AND kind = 'assistant'
                  ORDER BY id DESC LIMIT 1 RETURNING item_id",
            )
            .bind(rig.thread)
            .bind(block)
            .bind(state.to_string())
            .bind(told_by)
            .fetch_one(&rig.pool),
        )
        .unwrap();
    format!("{item}.{block}")
}

/// One more student message on the chat's live session, answered by
/// `recording` in full.
fn turn(rig: &mut Rig, recording: &Recording, receipt: &str, text: &str) -> store::RunStart {
    rig.expect_turn(recording);
    let run = rig
        .say(receipt, Provider::Claude, text, &sonnet())
        .unwrap()
        .run
        .unwrap();
    for frame in &recording.frames {
        rig.feed(frame);
    }
    rig.drain();
    run
}

/// Claude's first turn, answered: the chat's one session has seen it.
fn first_turn() -> (Rig, store::RunStart) {
    let mut rig = Rig::start(Scenario::recorded("claude-ls"));
    let first = rig.send_with("replay-send", &sonnet()).unwrap();
    rig.resume();
    rig.drain();
    assert_eq!(execution(&rig, first.run_id), "completed");
    (rig, first)
}

fn count(rig: &Rig, sql: &str) -> i64 {
    rig.runtime
        .block_on(sqlx::query_scalar(sql).fetch_one(&rig.pool))
        .unwrap()
}

fn execution(rig: &Rig, run_id: i64) -> String {
    let status = sqlx::query_scalar("SELECT execution_status FROM harness_runs WHERE id = ?1")
        .bind(run_id)
        .fetch_one(&rig.pool);
    rig.runtime.block_on(status).unwrap()
}

/// The session that was told a card is not told it again; one that was
/// not hears it.
#[test]
fn an_ordinary_second_turn_does_not_repeat_a_told_card() {
    let (mut rig, _) = first_turn();
    seed(&rig, REPORT, None);
    let claude = rig.recording("claude-ls");
    let second = turn(&mut rig, &claude, "second", "Second.");
    assert_eq!(execution(&rig, second.run_id), "completed");
    let third = turn(&mut rig, &claude, "third", "Third.");
    assert_eq!(execution(&rig, third.run_id), "completed");
    let prompts = rig.prompts();
    assert!(prompts[0].contains(REPORT), "{}", prompts[0]);
    assert!(
        !prompts[1].contains("Cards in this thread"),
        "{}",
        prompts[1]
    );
    rig.finish();
}

/// A live session that never named itself cannot be resumed under another
/// reasoning level: a new one takes the send, with no handoff planned (the
/// binding still covers the chat). Its first prompt lists the card the old
/// session was told.
#[test]
fn a_session_replaced_without_a_handoff_hears_every_card_on_its_first_prompt() {
    let (mut rig, first) = first_turn();
    seed(&rig, REPORT, Some(first.run_id));
    let unnamed = sqlx::query("UPDATE harness_bindings SET native_session = NULL");
    rig.runtime.block_on(unnamed.execute(&rig.pool)).unwrap();
    let claude = rig.recording("claude-ls");
    let mut replacement = rig.session_of(&claude);
    let high = SendOptions {
        reasoning_effort: Some("high".into()),
        ..sonnet()
    };
    let second = rig
        .say("second", Provider::Claude, "Think harder.", &high)
        .unwrap()
        .run
        .unwrap();
    assert_eq!(second.binding_id, first.binding_id, "the same binding");
    assert_eq!(count(&rig, "SELECT COUNT(*) FROM harness_handoffs"), 0);
    claude.play(&mut replacement);
    rig.drain();
    assert_eq!(execution(&rig, second.run_id), "completed");
    let prompts = rig.prompts();
    assert!(prompts[0].starts_with("Think harder."), "{}", prompts[0]);
    assert!(prompts[0].contains(REPORT), "{}", prompts[0]);
    rig.finish();
}

/// The session keeps its own conversation through a rewind of the turn
/// whose prompt told a card from before it: that outcome went with the
/// turn, so the next send lists the card again.
#[test]
fn a_rewind_of_the_telling_turn_lists_the_surviving_card_again() {
    let (mut rig, _) = first_turn();
    seed(&rig, REPORT, None);
    let claude = rig.recording("claude-ls");
    let second = turn(&mut rig, &claude, "second", "Second.");
    let told: Option<i64> = rig
        .runtime
        .block_on(sqlx::query_scalar("SELECT told_run_id FROM chat_proposals").fetch_one(&rig.pool))
        .unwrap();
    assert_eq!(told, Some(second.run_id));
    // The commit a rewind makes once the provider took the turn back.
    let rewind = async {
        let mut tx = rig.pool.begin().await.unwrap();
        let stale = store::bindings::rewound(
            &mut tx,
            rig.thread,
            second.item_id,
            crate::harness::providers::capabilities::Rewind::Native,
        )
        .await;
        assert_eq!(stale.unwrap(), vec![], "the session is kept");
        store::truncate(&mut tx, rig.thread, second.item_id)
            .await
            .unwrap();
        tx.commit().await.unwrap();
    };
    rig.runtime.block_on(rewind);
    assert_eq!(count(&rig, "SELECT COUNT(*) FROM chat_proposals"), 1);
    let third = turn(&mut rig, &claude, "third", "Second, again.");
    assert_eq!(execution(&rig, third.run_id), "completed");
    let prompts = rig.prompts();
    assert!(prompts[0].contains(REPORT), "{}", prompts[0]);
    assert!(prompts[1].contains(REPORT), "{}", prompts[1]);
    rig.finish();
}

/// A switch to Codex planned with its full handoff and stopped before
/// Codex heard it: Claude's session is still told nothing twice, and a
/// card it has not heard still comes.
#[test]
fn a_stop_that_withdraws_a_run_neither_repeats_nor_loses_a_card() {
    let (mut rig, first) = first_turn();
    rig.harness.allow_handoff_everywhere();
    seed(&rig, REPORT, Some(first.run_id));
    let unheard = "Week 4 covers NFAs";
    seed(&rig, unheard, None);
    rig.hold_effects();
    let switch = rig
        .say(
            "switch",
            Provider::Codex,
            "Over to Codex.",
            &SendOptions::default(),
        )
        .unwrap()
        .run
        .unwrap();
    assert_eq!(
        count(
            &rig,
            "SELECT COUNT(*) FROM harness_handoffs WHERE kind = 'full'"
        ),
        1
    );
    rig.command(Command {
        id: "stop".into(),
        thread_id: Some(rig.thread),
        kind: Kind::Stop {
            run_id: Some(switch.run_id),
        },
    })
    .unwrap();
    rig.release_effects();
    assert_ne!(execution(&rig, switch.run_id), "completed");
    let claude = rig.recording("claude-ls");
    let back = turn(&mut rig, &claude, "back", "Back to Claude.");
    assert_eq!(execution(&rig, back.run_id), "completed");
    let prompts = rig.prompts();
    assert!(!prompts[0].contains(REPORT), "{}", prompts[0]);
    assert!(prompts[0].contains(unheard), "{}", prompts[0]);
    rig.finish();
}

/// More cards than the section's cap: the newest go, the section says how
/// many older ones wait, and those come with the next message.
#[test]
fn the_cap_leaves_out_the_oldest_cards_says_so_and_sends_them_next() {
    let (mut rig, _) = first_turn();
    let body = "r".repeat(crate::harness::app::proposal_context::CARDS_CAP / 3 - 200);
    let reports: Vec<String> = (0..5).map(|n| format!("report-{n}-{body}")).collect();
    for report in &reports {
        seed(&rig, report, None);
    }
    let claude = rig.recording("claude-ls");
    turn(&mut rig, &claude, "second", "Second.");
    turn(&mut rig, &claude, "third", "Third.");
    let prompts = rig.prompts();
    let has = |prompt: &str, n: usize| prompt.contains(&format!("report-{n}-"));
    assert_eq!(
        (0..5).map(|n| has(&prompts[0], n)).collect::<Vec<_>>(),
        [false, false, true, true, true]
    );
    assert!(prompts[0].contains("2 older cards are not listed here"));
    assert_eq!(
        (0..5).map(|n| has(&prompts[1], n)).collect::<Vec<_>>(),
        [true, true, false, false, false]
    );
    assert!(!prompts[1].contains("not listed here"));
    rig.finish();
}
