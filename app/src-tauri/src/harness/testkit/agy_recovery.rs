//! Derived ACP setup traffic for fresh sessions after a failed load or a rewind.
use std::sync::{mpsc, Arc};

use serde_json::{json, Value};

use crate::harness::antigravity::acp::{replay::open_session, OpenError};
use crate::harness::antigravity::AcpSession;
use crate::harness::manager::Handle;
use crate::harness::{Harness, Provider, SendError, SendOptions};

use super::{
    outbound::{Expected, Outbound},
    rig::Rig,
    scenario::Scenario,
};

fn expected(id: i64, method: &str, params: Value, response: Value, prompt: bool) -> Expected {
    Expected {
        frame: json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}),
        response,
        error: None,
        any_prompt: prompt,
    }
}

fn initialize() -> Expected {
    expected(
        1,
        "initialize",
        json!({
            "protocolVersion":1,
            "clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false},"terminal":false,"elicitation":{"form":{}}},
            "clientInfo":{"name":"oculus","title":"Oculus","version":env!("CARGO_PKG_VERSION")},
        }),
        json!({"agentInfo":{"version":"1.5.9"}}),
        false,
    )
}

fn prompt(id: i64, session: &str) -> Expected {
    expected(
        id,
        "session/prompt",
        json!({"sessionId":session,"prompt":[{"type":"text","text":"Replay request"}]}),
        Value::Null,
        true,
    )
}

fn new_session(session: &str) -> [Expected; 4] {
    [
        initialize(),
        expected(
            2,
            "session/new",
            json!({"cwd":"$SCRATCH/agents","mcpServers":[]}),
            json!({"sessionId": session}),
            false,
        ),
        expected(
            3,
            "session/set_mode",
            json!({"sessionId":session,"modeId":"default"}),
            json!({}),
            false,
        ),
        prompt(4, session),
    ]
}

/// Register the ACP handshake using the session id chosen by the real send.
fn register_session(
    harness: &Harness,
    thread: i64,
    outbound: Outbound,
    root: std::path::PathBuf,
    opened: mpsc::Sender<Arc<AcpSession>>,
) {
    harness.replay_spawn_result(thread, Provider::Antigravity, move |sink, resume| {
        let session = open_session(outbound, sink, resume, &root)
            .map_err(|e| SendError::Unsent(e.to_string()))?;
        opened.send(session.clone()).unwrap();
        Ok(Handle::Antigravity(session))
    });
}

#[test]
fn a_failed_load_starts_new_with_one_full_handoff_and_the_next_send_uses_its_id() {
    let mut scenario = Scenario::recorded("antigravity-acp-ls");
    scenario.frames.clear();
    scenario.fixture.expected_outbound = vec![
        initialize(),
        expected(
            2,
            "session/load",
            json!({"cwd":"$SCRATCH/agents","mcpServers":[],"sessionId":"old-print-id"}),
            json!({"error":{"code":-32603,"message":"conversation not found"}}),
            false,
        ),
    ];
    scenario
        .fixture
        .expected_outbound
        .extend(new_session("fresh-acp-id"));
    scenario
        .fixture
        .expected_outbound
        .push(prompt(5, "fresh-acp-id"));
    let mut rig = Rig::start(scenario);
    rig.runtime.block_on(async {
        let binding: i64 = sqlx::query_scalar("INSERT INTO harness_bindings (thread_id,provider,current,native_session,covered_through) VALUES (?1,'antigravity',1,'old-print-id',1) RETURNING id")
            .bind(rig.thread).fetch_one(&rig.pool).await.unwrap();
        let old: i64 = sqlx::query_scalar("INSERT INTO harness_runs (thread_id,ordinal,origin,binding_id,execution_status,delivery_state) VALUES (?1,1,'student',?2,'completed','delivered') RETURNING id")
            .bind(rig.thread).bind(binding).fetch_one(&rig.pool).await.unwrap();
        for (kind, text, column) in [("user","Remember locker 19","initiating_item_id"),("assistant","Your locker is 19","answer_item_id")] {
            let item: i64 = sqlx::query_scalar("INSERT INTO harness_items (thread_id,kind,content,run_id) VALUES (?1,?2,?3,?4) RETURNING id")
                .bind(rig.thread).bind(kind).bind(text).bind(old).fetch_one(&rig.pool).await.unwrap();
            sqlx::query(&format!("UPDATE harness_runs SET {column} = ?2 WHERE id = ?1")).bind(old).bind(item).execute(&rig.pool).await.unwrap();
        }
        // A card the old session was told, which the new one must hear again.
        sqlx::query("INSERT INTO chat_proposals (item_id,block,thread_id,kind,status,state,initial_state,told,told_run_id) SELECT answer_item_id,0,thread_id,'Subagent','created',?2,?2,'created',id FROM harness_runs WHERE id = ?1")
            .bind(old).bind(json!({"title":"Locker","task":"Find the locker","job":{"phase":"complete","result":"Locker 19 is in building 7"}}).to_string())
            .execute(&rig.pool).await.unwrap();
    });
    let (opened, bridge) = mpsc::channel();
    let (harness, thread, outbound, root) = (
        Arc::downgrade(&rig.harness),
        rig.thread,
        rig.outbound.clone(),
        rig.scratch.to_path_buf(),
    );
    rig.harness
        .replay_spawn_result(thread, Provider::Antigravity, move |sink, resume| {
            let error = match open_session(outbound.clone(), sink, resume, &root) {
                Err(OpenError::Load(e)) => e,
                _ => panic!("the real load must fail before any prompt"),
            };
            register_session(&harness.upgrade().unwrap(), thread, outbound, root, opened);
            Err(SendError::ResumeFailed(error))
        });
    rig.say(
        "recover",
        Provider::Antigravity,
        "Which locker?",
        &SendOptions::default(),
    )
    .unwrap();
    rig.drain();
    let prompt = rig.prompts().remove(0);
    assert!(prompt.contains("<earlier-conversation"));
    assert!(prompt.contains("Remember locker 19"));
    assert!(prompt.contains("Your locker is 19"));
    assert_eq!(prompt.matches("Which locker?").count(), 1);
    assert!(prompt.contains("Locker 19 is in building 7"), "{prompt}");
    let reply = |id| json!({"id":id,"result":{"stopReason":"end_turn"}});
    let session = bridge.try_recv().unwrap();
    session.inbound(&reply(4));
    rig.drain();
    rig.say(
        "next",
        Provider::Antigravity,
        "Thank you",
        &SendOptions::default(),
    )
    .unwrap();
    rig.drain();
    assert_eq!(rig.prompts(), [prompt, "Thank you".into()]);
    session.inbound(&reply(5));
    rig.drain();
    let current: String = rig
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT native_session FROM harness_bindings WHERE current = 1")
                .fetch_one(&rig.pool),
        )
        .unwrap();
    assert_eq!(current, "fresh-acp-id");
    let handoffs: i64 = rig
        .runtime
        .block_on(
            sqlx::query_scalar(
                "SELECT count(*) FROM harness_handoffs WHERE kind='full' AND status='inline'",
            )
            .fetch_one(&rig.pool),
        )
        .unwrap();
    assert_eq!(handoffs, 1);
    let notes: i64 = rig
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT count(*) FROM harness_items WHERE kind='session_restarted'")
                .fetch_one(&rig.pool),
        )
        .unwrap();
    assert_eq!(notes, 1);
    rig.drain();
    let replay = rig.finish();
    assert_eq!(replay.items, replay.reopened);
}

#[test]
fn a_stop_or_delete_before_recovery_does_not_replace_the_binding() {
    for delete in [false, true] {
        let mut scenario = Scenario::recorded("antigravity-acp-ls");
        scenario.frames.clear();
        scenario.fixture.expected_outbound.clear();
        let mut rig = Rig::start(scenario);
        rig.hold_effects();
        rig.open();
        let run = rig.runtime.block_on(async {
            let (run_id, attempt_id, binding_id, item_id): (i64, i64, i64, i64) = sqlx::query_as(
                "SELECT id,active_attempt_id,binding_id,initiating_item_id FROM harness_runs",
            )
            .fetch_one(&rig.pool)
            .await
            .unwrap();
            let run = crate::harness::store::RunStart {
                run_id,
                attempt_id,
                binding_id,
                item_id,
            };
            assert!(crate::harness::store::claim_start(&rig.pool, &run)
                .await
                .unwrap());
            sqlx::query(if delete {
                "DELETE FROM harness_runs WHERE id = ?1"
            } else {
                "UPDATE harness_runs SET stop_requested_at = datetime('now') WHERE id = ?1"
            })
            .bind(run_id)
            .execute(&rig.pool)
            .await
            .unwrap();
            run
        });
        assert!(!rig
            .runtime
            .block_on(crate::harness::handoff::store::restart(
                &rig.pool, &run, "next"
            ))
            .unwrap());
        let count: i64 = rig
            .runtime
            .block_on(
                sqlx::query_scalar("SELECT count(*) FROM harness_bindings").fetch_one(&rig.pool),
            )
            .unwrap();
        assert_eq!(count, 1);
        rig.finish();
    }
}

#[test]
fn a_mid_chat_rewind_opens_a_new_acp_session_with_only_the_kept_exchange() {
    use crate::harness::core::{Command, Kind};
    use crate::harness::store::bindings;

    let agy = Provider::Antigravity;
    let options = SendOptions::default();
    let mut scenario = Scenario::recorded("antigravity-acp-ls");
    scenario.frames.clear();
    scenario.fixture.expected_outbound = new_session("original").into();
    scenario
        .fixture
        .expected_outbound
        .extend([prompt(5, "original"), prompt(6, "original")]);
    scenario
        .fixture
        .expected_outbound
        .extend(new_session("replacement"));
    let mut rig = Rig::start(scenario);
    let open = |rig: &Rig| {
        let (opened, bridge) = mpsc::channel();
        register_session(
            &rig.harness,
            rig.thread,
            rig.outbound.clone(),
            rig.scratch.to_path_buf(),
            opened,
        );
        bridge
    };
    let answer = |acp: &AcpSession, session, id, text| {
        acp.inbound(
            &json!({"method":"session/update","params":{"sessionId":session,"update":{
                "sessionUpdate":"agent_message_chunk","content":{"type":"text","text":text}
            }}}),
        );
        acp.inbound(&json!({"id":id,"result":{"stopReason":"end_turn"}}));
    };
    let opened = open(&rig);
    rig.say("first", agy, "Kept question", &options).unwrap();
    let old = opened.try_recv().unwrap();
    answer(&old, "original", 4, "Kept answer");
    rig.drain();
    let second = rig
        .say("second", agy, "Removed question", &options)
        .unwrap()
        .run
        .unwrap();
    answer(&old, "original", 5, "Removed answer");
    rig.drain();
    rig.say("third", agy, "Later question", &options).unwrap();
    answer(&old, "original", 6, "Later answer");
    rig.drain();
    let binding = |rig: &Rig| {
        rig.runtime
            .block_on(bindings::find(&rig.pool, rig.thread, agy))
            .unwrap()
            .unwrap()
    };
    assert_eq!(binding(&rig).native_session.as_deref(), Some("original"));

    rig.command(Command {
        id: "rewind".into(),
        thread_id: Some(rig.thread),
        kind: Kind::Rewind {
            item_id: second.item_id,
        },
    })
    .unwrap();
    assert!(!old.is_alive());
    let reset = binding(&rig);
    assert_eq!((reset.native_session, reset.covered_through), (None, 0));
    assert!(rig
        .envelopes()
        .iter()
        .any(|e| e["event"]["type"] == "rewound" && e["event"]["context"] == true));

    let opened = open(&rig);
    rig.say("next", agy, "Next question", &options).unwrap();
    let fresh = opened.try_recv().unwrap();
    answer(&fresh, "replacement", 4, "Next answer");
    rig.drain();
    let prompt = rig.prompts().pop().unwrap();
    assert!(prompt.contains("2 messages follow, whole and in order."));
    assert!(prompt.contains("[Student]\nKept question"));
    assert!(prompt.contains("[Agent (Antigravity)]\nKept answer"));
    assert!(prompt.ends_with("The student's new message:\nNext question"));
    assert!(!prompt.contains("Removed") && !prompt.contains("Later"));
    assert_eq!(binding(&rig).native_session.as_deref(), Some("replacement"));
    let handoff: (String, String) = rig
        .runtime
        .block_on(sqlx::query_as("SELECT kind,status FROM harness_handoffs").fetch_one(&rig.pool))
        .unwrap();
    assert_eq!(handoff, ("full".into(), "inline".into()));
    rig.finish();
}
