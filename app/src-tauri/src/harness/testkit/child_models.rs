use serde_json::{json, Value};

use crate::harness::antigravity::acp::replay::opening_with_options;
use crate::harness::app::children;
use crate::harness::manager::Handle;
use crate::harness::opencode::{OpencodeSessionOpts, AGENT};
use crate::harness::{Provider, SendError};

use super::child_lifecycle::brief;
use super::children::named;
use super::outbound::Expected;
use super::rig::Rig;

fn exchange(frame: Value, response: Value) -> Expected {
    Expected {
        frame,
        response,
        error: None,
        any_prompt: false,
    }
}

fn rpc(id: u64, method: &str, params: Value, response: Value) -> Expected {
    exchange(
        json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}),
        response,
    )
}

/// Hold the first send after its commit so the test can register the child's own opener.
fn pending(rig: &mut Rig, model: &str, effort: Option<&str>) -> i64 {
    let mut brief = brief(rig, model);
    brief.effort = effort.map(String::from);
    let command = rig
        .runtime
        .block_on(children::command(&rig.pool, "card", brief))
        .unwrap();
    rig.hold_effects();
    rig.command(command).unwrap().thread_id
}

#[test]
fn claudes_replay_spawn_receives_the_childs_model_and_effort() {
    let (scenario, model) = named("claude-ls");
    let mut rig = Rig::start(scenario);
    let child = pending(&mut rig, model, Some("medium"));
    let wire = rig.outbound.wire();
    rig.harness
        .replay_spawn_with_options(child, Provider::Claude, move |sink, opts| {
            assert_eq!(opts.model.as_deref(), Some(model));
            assert_eq!(opts.reasoning_effort.as_deref(), Some("medium"));
            Ok(crate::harness::claude::replay::bridge(wire, sink).handle)
        });
    rig.run_effects();
    rig.finish();
}

#[test]
fn opencode_opens_the_child_with_its_model_and_names_it_on_the_prompt() {
    let (mut scenario, model) = named("opencode-v1-ls");
    let native = scenario.fixture.native_session.clone();
    let expected = &mut scenario.fixture.expected_outbound;
    expected[0].frame["body"]["model"] =
        json!({"providerID":"openrouter","modelID":"openai/gpt-4.1-mini"});
    // The turn excerpt starts at prompt_async; setup responses are synthetic.
    let open = exchange(
        json!({
            "method": "POST", "path": "/session?directory=$SCRATCH/agents",
            "body": {"agent": "oculus", "model": {"providerID": "openrouter", "id": "openai/gpt-4.1-mini"}}
        }),
        json!({"id": native}),
    );
    let catalogue = exchange(
        json!({"method": "GET", "path": "/config/providers?directory=$SCRATCH/agents", "body": null}),
        json!({"providers": []}),
    );
    expected.splice(..0, [open, catalogue]);
    let mut rig = Rig::start(scenario);
    let child = pending(&mut rig, model, None);
    let outbound = rig.outbound.clone();
    let root = rig.scratch.to_path_buf();
    rig.harness
        .replay_spawn_with_options(child, Provider::Opencode, move |sink, opts| {
            let bridge =
                crate::harness::opencode::replay::bridge(outbound, sink.clone(), &native, &root);
            let Handle::Opencode(server, _) = bridge.handle else {
                unreachable!()
            };
            let id = server.start_session(
                &OpencodeSessionOpts {
                    agent: AGENT,
                    model: opts.model.clone(),
                    variant: opts.reasoning_effort.clone(),
                    ..Default::default()
                },
                sink,
            )?;
            Ok(Handle::Opencode(server, id))
        });
    rig.run_effects();
    rig.finish();
}

#[test]
fn antigravity_sets_the_childs_model_and_level_before_its_first_prompt() {
    let (mut scenario, _) = named("antigravity-acp-ls");
    let native = scenario.fixture.native_session.clone();
    // Reconstruct the setup described by the ls manifest. Only the prompt onwards is a captured excerpt.
    let expected = &mut scenario.fixture.expected_outbound;
    expected.truncate(1);
    let client = json!({
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": {"readTextFile": false, "writeTextFile": false},
            "terminal": false,
            "elicitation": {"form": {}}
        },
        "clientInfo": {"name": "oculus", "title": "Oculus", "version": env!("CARGO_PKG_VERSION")}
    });
    expected.splice(
        ..0,
        [
            rpc(
                1,
                "initialize",
                client,
                json!({"agentInfo": {"version": "1.5.9"}}),
            ),
            rpc(
                2,
                "session/new",
                json!({"cwd": "$SCRATCH/agents", "mcpServers": []}),
                json!({"sessionId": native}),
            ),
            rpc(
                3,
                "session/set_model",
                json!({"sessionId": native, "modelId": "gemini-3.8-flash-low"}),
                json!({}),
            ),
            rpc(
                4,
                "session/set_mode",
                json!({"sessionId": native, "modeId": "default"}),
                json!({}),
            ),
        ],
    );
    let mut rig = Rig::start(scenario);
    let child = pending(&mut rig, "gemini-3.8-flash", Some("low"));
    let outbound = rig.outbound.clone();
    let root = rig.scratch.to_path_buf();
    rig.harness
        .replay_spawn_with_options(child, Provider::Antigravity, move |sink, opts| {
            opening_with_options(outbound, sink, None, &root, opts)
                .map(|b| b.handle)
                .map_err(|e| SendError::Unsent(e.to_string()))
        });
    rig.run_effects();
    rig.finish();
}
