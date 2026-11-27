use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use crate::harness::event::{HarnessEvent, Turns};
use crate::harness::protected::{subject_dirs, STATE_DIRS, STATE_FILE_GLOBS, WORKSPACE_DIRS};
use crate::harness::requests::{Action, PermissionMode};

use super::policy::{allowed_command, judge, Verdict};
use super::updates::Translator;

const LIBRARY: &str = "/lib/oculus";

fn cwd() -> PathBuf {
    crate::agents::agents_dir(Path::new(LIBRARY))
}

/// A permission request for a native write of `path`, as agy 1.5.9 sends it.
fn write(path: &str) -> Value {
    json!({
        "sessionId": "s",
        "toolCall": {
            "toolCallId": "call_1",
            "name": "write_file",
            "kind": "edit",
            "status": "pending",
            "rawInput": { "Content": "x\n", "Path": path },
            "locations": [{ "path": path }],
            "content": [{ "type": "diff", "path": path, "newText": "x\n" }],
        },
        "options": [
            { "optionId": "allow", "name": "Allow", "kind": "allow_once" },
            { "optionId": "deny", "name": "Deny", "kind": "reject_once" },
        ],
    })
}

fn command(line: &str) -> Value {
    json!({
        "sessionId": "s",
        "toolCall": {
            "toolCallId": "call_2",
            "name": "run_command",
            "kind": "execute",
            "rawInput": { "CommandLine": line, "toolSummary": "Do it" },
        },
        "options": [],
    })
}

fn verdict(params: &Value) -> Verdict {
    judge(params, Path::new(LIBRARY), &cwd())
}

fn refused(path: &str) -> bool {
    matches!(
        verdict(&write(path)),
        Verdict::Deny(_) | Verdict::Protected(_)
    )
}

/// A path each rule `protected.rs` renders covers, with the rule's name:
/// every rule has a test below, and [`every_protected_rule_has_a_test`]
/// fails when one is added without one.
macro_rules! protected_rule {
    ($($test:ident: $rule:expr => $path:expr;)*) => {
        const RULES: &[&str] = &[$($rule),*];
        $(
            #[test]
            fn $test() {
                let path = format!("{LIBRARY}/{}", $path);
                assert!(refused(&path), "{} must refuse {path} unseen", $rule);
            }
        )*
    };
}

protected_rule! {
    course_is_refused_unseen: "Course" => "courses/maths/Course/Files/a.pdf";
    oculus_is_refused_unseen: ".oculus" => "courses/maths/.oculus/agents/INSTRUCTIONS.md";
    canvas_session_is_refused_unseen: "canvas-session" => ".oculus/canvas-session/cookies";
    agents_skills_is_refused_unseen: "skills" => ".oculus/agents/skills/oculus/SKILL.md";
    agents_claude_is_refused_unseen: ".claude" => ".oculus/agents/.claude/settings.json";
    agents_agents_is_refused_unseen: ".agents" => ".oculus/agents/.agents/skills/x/SKILL.md";
    cookie_files_are_refused_unseen: "*.cookie" => ".oculus/canvas.cookie";
    token_files_are_refused_unseen: "*.token" => ".oculus/ed.token";
    root_json_is_refused_unseen: "*.json" => ".oculus/settings.json";
    root_logs_are_refused_unseen: "*.log" => ".oculus/oculus.log";
    the_vault_is_refused_unseen: "vault.bin*" => ".oculus/vault.bin";
    the_vaults_temp_file_is_refused_unseen: ".vault.bin.*" => ".oculus/.vault.bin.4242.tmp";
    the_database_is_refused_unseen: "oculus.db" => ".oculus/oculus.db";
    the_databases_wal_is_refused_unseen: "oculus.db-wal" => ".oculus/oculus.db-wal";
    the_databases_shm_is_refused_unseen: "oculus.db-shm" => ".oculus/oculus.db-shm";
}

#[test]
fn every_protected_rule_has_a_test() {
    for rule in STATE_DIRS
        .iter()
        .chain(subject_dirs().iter())
        .chain(WORKSPACE_DIRS.iter())
        .chain(STATE_FILE_GLOBS.iter())
    {
        assert!(RULES.contains(rule), "no ACP policy test for {rule}");
    }
    for db in ["oculus.db", "oculus.db-wal", "oculus.db-shm"] {
        assert!(RULES.contains(&db), "no ACP policy test for {db}");
    }
}

#[test]
fn the_library_its_folders_above_and_agents_itself_are_refused_unseen() {
    for path in [
        "/lib/oculus",
        "/lib",
        "/",
        "/lib/oculus/.oculus",
        "/lib/oculus/.oculus/agents",
    ] {
        assert!(refused(path), "{path}");
    }
    // Spelt with other case, or through `..`, it is the same folder.
    assert!(refused("/lib/oculus/Courses/x/COURSE/home.md"));
    assert!(refused(
        "/lib/oculus/.oculus/agents/../../courses/x/Course/y"
    ));
    assert!(
        refused("../../courses/x.md"),
        "relative to the chat's folder"
    );
    // The subjects' folder and a subject's folder hold `Course/`.
    assert!(refused("/lib/oculus/courses"));
    assert!(refused("/lib/oculus/courses/maths"));
}

#[test]
fn writes_to_any_subjects_own_files_are_allowed_unseen() {
    for path in [
        "/lib/oculus/courses/maths/notes.md",
        "/lib/oculus/courses/maths/Exam prep/deep/summary.md",
        "/lib/oculus/courses/physics/table.json",
        "/lib/oculus/Courses/maths/Notes/a.md",
    ] {
        assert_eq!(verdict(&write(path)), Verdict::Allow, "{path}");
    }
    let mut both = write("/lib/oculus/courses/maths/notes.md");
    both["toolCall"]["locations"] = json!([{ "path": "/lib/oculus/.oculus/agents/draft.md" }]);
    assert_eq!(
        verdict(&both),
        Verdict::Allow,
        "own files and the chat's folder"
    );
}

#[test]
fn a_write_with_any_protected_path_is_refused_whatever_else_it_names() {
    let mut params = write("/lib/oculus/.oculus/agents/notes.md");
    params["toolCall"]["locations"] = json!([{ "path": "/lib/oculus/courses/x.md" }]);
    assert!(matches!(verdict(&params), Verdict::Protected(_)));
}

#[test]
fn a_write_that_names_no_path_is_refused() {
    let mut params = write("/x");
    let call = &mut params["toolCall"];
    call["rawInput"] = json!({ "Content": "x" });
    call["locations"] = json!([]);
    call["content"] = json!([]);
    assert!(matches!(verdict(&params), Verdict::Deny(_)));
}

#[test]
fn writes_under_the_chats_folder_and_studio_are_allowed_unseen() {
    for path in [
        "/lib/oculus/.oculus/agents/notes.md",
        "/lib/oculus/.oculus/agents/attachments/a.png",
        "/lib/oculus/.oculus/studio/video/video.json",
    ] {
        assert_eq!(verdict(&write(path)), Verdict::Allow, "{path}");
    }
}

#[test]
fn a_relative_write_is_judged_from_the_library_root_and_the_chats_folder() {
    // agy's commands run from the library root, so `courses/x.md` may
    // mean the protected folder.
    assert!(refused("courses/x.md"));
    assert!(refused("../../courses/x.md"));
    assert!(
        matches!(verdict(&write("scratch/out.txt")), Verdict::Ask(_)),
        "not under the write root read from the library root"
    );
}

#[test]
fn a_write_elsewhere_is_asked_as_a_file_change_naming_its_paths() {
    let Verdict::Ask(request) = verdict(&write("/elsewhere/new.txt")) else {
        panic!("asked");
    };
    assert_eq!(request.action, Action::FileChange);
    assert_eq!(request.paths, ["/elsewhere/new.txt"]);
    assert_eq!(
        request.payload["changes"],
        json!([{ "path": "/elsewhere/new.txt", "kind": "add", "diff": "+x\n" }])
    );
    assert_eq!(request.payload["tool"], "call_1");
    let ids: Vec<&str> = request.options.iter().map(|o| o.id.as_str()).collect();
    assert_eq!(ids, ["accept", "decline"], "approve once or decline only");
}

#[test]
fn a_symlinked_write_is_judged_by_where_agy_says_it_lands() {
    // `12-path-checks`: the input names the link, `locations` the target.
    let mut params = write("/lib/oculus/.oculus/agents/outside-link/symlink.txt");
    params["toolCall"]["locations"] = json!([{ "path": "/elsewhere/symlink.txt" }]);
    let Verdict::Ask(request) = verdict(&params) else {
        panic!("not allowed by its link's folder");
    };
    assert!(request
        .paths
        .contains(&"/elsewhere/symlink.txt".to_string()));
}

#[test]
fn plain_oculus_and_ls_lines_are_allowed_and_nothing_chained_is() {
    for line in [
        "oculus search \"limits\" -s MAST10006",
        "ls -la ../courses",
        "ls",
    ] {
        assert!(allowed_command(line), "{line}");
        assert_eq!(verdict(&command(line)), Verdict::Allow, "{line}");
    }
    for line in [
        "ls; rm -rf ../courses",
        "ls && touch x",
        "oculus search x | sh",
        "ls > ../courses/x",
        "ls $(rm x)",
        "ls `rm x`",
        "oculus\nrm x",
        "FOO=1 oculus search",
        "/tmp/oculus search",
        "lsof",
        "pwd",
        "cd /tmp && ls",
    ] {
        assert!(!allowed_command(line), "{line}");
    }
}

#[test]
fn any_other_command_is_asked_and_a_sandbox_bypass_says_so() {
    let Verdict::Ask(request) = verdict(&command("touch x")) else {
        panic!("asked");
    };
    assert_eq!(request.action, Action::Command);
    assert_eq!(request.payload["command"], "touch x");
    assert_eq!(request.payload["reason"], "Do it");
    assert_eq!(request.payload["outsideSandbox"], false);
    let mut bypass = command("ls");
    bypass["toolCall"]["rawInput"]["BypassSandbox"] = json!(true);
    let Verdict::Ask(request) = verdict(&bypass) else {
        panic!("ls leaving the sandbox is asked");
    };
    assert_eq!(request.payload["outsideSandbox"], true);
}

#[test]
fn a_plain_oculus_bypass_is_allowed_but_shell_syntax_still_asks() {
    let mut plain = command("oculus memory add fact");
    plain["toolCall"]["rawInput"]["BypassSandbox"] = json!(true);
    assert_eq!(verdict(&plain), Verdict::Allow);
    plain["toolCall"]["rawInput"]["CommandLine"] = json!("oculus x; rm -rf ~");
    assert!(matches!(verdict(&plain), Verdict::Ask(_)));
}

#[test]
fn reads_fetches_and_other_tools_are_asked_as_tool_calls() {
    let read = json!({ "toolCall": {
        "toolCallId": "c", "name": "read_file", "kind": "read",
        "rawInput": { "Path": "/etc/hosts" }, "locations": [{ "path": "/etc/hosts" }],
    }});
    let Verdict::Ask(request) = verdict(&read) else {
        panic!()
    };
    assert_eq!(request.action, Action::Tool);
    assert_eq!(request.payload["kind"], "read");
    assert_eq!(request.payload["path"], "/etc/hosts");
    assert!(request.paths.is_empty(), "a read is not checked as a write");
    let fetch = json!({ "toolCall": {
        "toolCallId": "c", "name": "read_url_content", "kind": "fetch",
        "rawInput": { "Url": "https://example.com" },
    }});
    let Verdict::Ask(request) = verdict(&fetch) else {
        panic!()
    };
    assert_eq!(request.payload["url"], "https://example.com");
    let other = json!({ "toolCall": {
        "toolCallId": "c", "name": "browser", "kind": "other", "rawInput": { "Task": "x" },
    }});
    let Verdict::Ask(request) = verdict(&other) else {
        panic!()
    };
    assert_eq!(request.payload["kind"], "other");
    assert_eq!(request.payload["arguments"], json!({ "Task": "x" }));
}

fn translator() -> Translator {
    Translator::new(Arc::new(Turns::default()))
}

fn update(kind: &str, extra: Value) -> Value {
    let mut u = json!({ "sessionUpdate": kind });
    for (k, v) in extra.as_object().unwrap() {
        u[k] = v.clone();
    }
    u
}

fn chunk(kind: &str, text: &str) -> Value {
    update(kind, json!({ "content": { "type": "text", "text": text } }))
}

#[test]
fn chunks_join_into_named_blocks_split_by_tools_and_closed_by_the_reply() {
    let mut t = translator();
    let sent = t.turns.reserve();
    let mut events = Vec::new();
    for u in [
        chunk("user_message_chunk", "the prompt's echo"),
        chunk("agent_thought_chunk", "Thinking "),
        chunk("agent_thought_chunk", "it over."),
        chunk("agent_message_chunk", "First "),
        chunk("agent_message_chunk", "part."),
        update(
            "tool_call",
            json!({ "toolCallId": "call_1", "name": "run_command", "status": "in_progress",
                    "rawInput": { "CommandLine": "false" } }),
        ),
        update(
            "tool_call_update",
            json!({ "toolCallId": "call_1", "status": "completed",
                    "rawOutput": { "output": "exited 1", "exit_code": 1 } }),
        ),
        chunk("agent_message_chunk", "Done."),
        update("usage_update", json!({ "used": 120, "size": 1000 })),
    ] {
        events.extend(t.update(&u, Path::new(LIBRARY), &cwd()));
    }
    events.extend(t.finish(Ok(json!({
        "stopReason": "end_turn",
        "usage": {
            "inputTokens": 7,
            "cachedReadTokens": 10,
            "cachedWriteTokens": 2,
            "outputTokens": 3
        }
    }))));
    let kept: Vec<Value> = events
        .iter()
        .filter(|e| {
            !matches!(
                e,
                HarnessEvent::AssistantDelta { .. } | HarnessEvent::ThinkingDelta { .. }
            )
        })
        .map(|e| serde_json::to_value(e).unwrap())
        .collect();
    let types: Vec<&str> = kept.iter().map(|e| e["type"].as_str().unwrap()).collect();
    assert_eq!(
        types,
        [
            "turn_started",
            "thinking",
            "assistant_message",
            "tool_started",
            "tool_finished",
            "assistant_message",
            "usage",
            "turn_finished",
        ]
    );
    assert_eq!(kept[1]["text"], "Thinking it over.");
    assert_eq!(kept[2]["text"], "First part.");
    assert_eq!(kept[2]["source"]["id"], "msg-2");
    assert_eq!(kept[4]["ok"], false, "exit code 1 is a failed command");
    assert_eq!(kept[5]["source"]["id"], "msg-3");
    assert!(kept[5]["source"].get("partial").is_none());
    assert_eq!(kept[6]["context_tokens"], 120);
    assert_eq!(kept[6]["input_tokens"], 19);
    assert_eq!(kept[7]["status"], "completed");
    let HarnessEvent::TurnFinished { turn, .. } = events.last().unwrap() else {
        panic!()
    };
    assert_eq!(turn.as_ref(), Some(&sent), "the send's turn ends");
}

#[test]
fn a_stopped_reply_keeps_the_text_as_partial_with_no_gap_and_a_cut_off_one_gaps() {
    let mut t = translator();
    t.turns.reserve();
    t.update(
        &chunk("agent_message_chunk", "1."),
        Path::new(LIBRARY),
        &cwd(),
    );
    let stopped = t.finish(Ok(json!({ "stopReason": "cancelled" })));
    let json: Vec<Value> = stopped
        .iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect();
    assert_eq!(json[0]["source"]["partial"], true);
    assert!(json.iter().all(|e| e["type"] != "delivery_gap"));
    assert_eq!(json.last().unwrap()["status"], "interrupted");

    let mut t = translator();
    t.turns.reserve();
    t.update(
        &chunk("agent_message_chunk", "Half"),
        Path::new(LIBRARY),
        &cwd(),
    );
    let (cut, turn) = t.close();
    let json: Vec<Value> = cut
        .iter()
        .map(|e| serde_json::to_value(e).unwrap())
        .collect();
    assert_eq!(json[0]["source"]["partial"], true);
    assert_eq!(json[1]["type"], "delivery_gap");
    assert_eq!(turn.as_deref(), Some("1"));
}

#[test]
fn a_refusal_or_an_unknown_stop_fails_the_turn_and_an_error_reply_does_too() {
    for reply in [
        Ok(json!({ "stopReason": "refusal" })),
        Ok(json!({ "stopReason": "something_new" })),
        Err("Internal error".to_string()),
    ] {
        let mut t = translator();
        t.turns.reserve();
        let events = t.finish(reply);
        assert!(matches!(events[0], HarnessEvent::Error { .. }));
        assert!(matches!(
            events.last(),
            Some(HarnessEvent::TurnFinished { status, .. }) if status == "failed"
        ));
    }
}

/// What a scripted transport heard, and the replies it gives.
type Heard = Arc<Mutex<Vec<Value>>>;

/// An [`AcpSession`] on a scripted transport: each request of ours gets
/// `reply(method)` at once, as agy would answer it.
fn scripted(
    base: &crate::harness::child::ThreadSpawn,
    guarded: bool,
    reply: impl Fn(&str) -> Value + Send + Sync + 'static,
) -> (Arc<super::AcpSession>, Heard, Arc<Mutex<Vec<HarnessEvent>>>) {
    let heard: Heard = Arc::default();
    let events: Arc<Mutex<Vec<HarnessEvent>>> = Arc::default();
    let me: Arc<Mutex<std::sync::Weak<super::AcpSession>>> = Arc::default();
    let (h, m) = (heard.clone(), me.clone());
    let proc = crate::harness::child::ChildProc::replay(Arc::new(move |frame: Value| {
        h.lock().unwrap().push(frame.clone());
        if let (Some(method), Some(id)) = (frame["method"].as_str(), frame.get("id")) {
            if method != "session/prompt" {
                let mut result = reply(method);
                if method == "initialize" && result["agentInfo"].is_null() {
                    result["agentInfo"] =
                        json!({ "name": "Antigravity ACP Server", "version": "1.5.9" });
                }
                if let Some(s) = m.lock().unwrap().upgrade() {
                    s.rpc_reply(json!({ "id": id, "result": result }));
                }
            }
        }
        Ok(())
    }));
    let sink_events = events.clone();
    let sink: crate::harness::Sink = Arc::new(move |e| sink_events.lock().unwrap().push(e));
    let session = super::AcpSession::new(proc, 1, sink, base, false, guarded);
    *me.lock().unwrap() = Arc::downgrade(&session);
    (session, heard, events)
}

fn base(
    resume: Option<&str>,
    model: Option<&str>,
    effort: Option<&str>,
) -> crate::harness::child::ThreadSpawn {
    crate::harness::child::ThreadSpawn {
        bin: "agy".into(),
        cwd: cwd(),
        library: LIBRARY.into(),
        resume: resume.map(String::from),
        model: model.map(String::from),
        effort: effort.map(String::from),
        env: Vec::new(),
        raw_log: None,
    }
}

#[test]
fn only_an_unguarded_launch_uses_agys_terminal_sandbox() {
    let base = base(None, None, None);
    assert_eq!(
        super::session::launch_args(&base, true),
        ["acp", "--add-dir", LIBRARY]
    );
    assert_eq!(
        super::session::launch_args(&base, false),
        ["acp", "--sandbox", "--add-dir", LIBRARY]
    );
}

fn offers_auto() -> Value {
    json!({"currentModeId":"default","availableModes":[{"id":"default"},{"id":"accept-edits"},{"id":"auto"},{"id":"plan"}]})
}

fn methods(heard: &Heard) -> Vec<String> {
    heard
        .lock()
        .unwrap()
        .iter()
        .map(|f| f["method"].as_str().unwrap_or("(answer)").to_string())
        .collect()
}

#[test]
fn a_new_session_carries_the_brief_and_takes_its_model_level_and_mode() {
    let spawn = base(None, Some("gemini-3.8-flash"), Some("low"));
    let (session, heard, events) = scripted(&spawn, true, |method| match method {
        "session/new" => json!({ "sessionId": "new-1", "modes": offers_auto() }),
        _ => json!({}),
    });
    session
        .open(&spawn, "The brief.", PermissionMode::Ask)
        .unwrap();
    assert_eq!(
        methods(&heard),
        [
            "initialize",
            "session/new",
            "session/set_model",
            "session/set_mode"
        ]
    );
    let frames = heard.lock().unwrap().clone();
    assert_eq!(
        frames[0]["params"]["clientCapabilities"],
        json!({ "fs": { "readTextFile": false, "writeTextFile": false }, "terminal": false, "elicitation": {"form":{}} }),
        "only form elicitation is offered"
    );
    assert_eq!(
        frames[1]["params"]["_meta"]["antigravity"]["systemPrompt"]["append"],
        format!(
            "The brief.\n\n{}",
            include_str!("../../../../../templates/ANTIGRAVITY_GUARD.template.md").trim()
        )
    );
    assert_eq!(frames[1]["params"]["cwd"], cwd().display().to_string());
    assert_eq!(frames[2]["params"]["modelId"], "gemini-3.8-flash-low");
    assert_eq!(frames[3]["params"]["modeId"], "default");
    assert!(matches!(
        &events.lock().unwrap()[0],
        HarnessEvent::SessionStarted { provider_session_id, .. } if provider_session_id == "new-1"
    ));
}

#[test]
fn auto_uses_the_offered_mode_or_explains_the_fallback_once() {
    for (guarded, offered, expected) in [
        (true, json!({"modes": offers_auto()}), "auto"),
        (false, json!({"modes": offers_auto()}), "default"),
        (
            true,
            json!({"modes":{"availableModes":[{"id":"accept-edits"},{"id":"plan"}]}}),
            "default",
        ),
        (true, json!({}), "default"),
    ] {
        let spawn = base(None, None, None);
        let (session, heard, events) = scripted(&spawn, guarded, move |method| {
            let mut result = json!({});
            if method == "session/new" {
                result = offered.clone();
                result["sessionId"] = json!("s");
            }
            result
        });
        session.open(&spawn, "", PermissionMode::Auto).unwrap();
        if !guarded {
            assert!(heard.lock().unwrap()[1]["params"].get("_meta").is_none());
        }
        assert_eq!(
            heard.lock().unwrap().last().unwrap()["params"]["modeId"],
            expected
        );
        heard.lock().unwrap().clear();
        session
            .send("hi", &crate::harness::event::unbound())
            .unwrap();
        assert_eq!(methods(&heard), ["session/prompt"]);
        let notices: Vec<_> = events
            .lock()
            .unwrap()
            .iter()
            .filter_map(|ev| match ev {
                HarnessEvent::SessionNotice { text } => Some(text.clone()),
                _ => None,
            })
            .collect();
        if expected == "auto" {
            assert!(notices.is_empty());
        } else if guarded {
            assert_eq!(
                notices,
                ["Antigravity's Auto is not available on this sign-in, so it asks."]
            );
        } else {
            assert_eq!(notices, ["Antigravity's Auto needs Oculus's folder guard, which is not available here, so it asks."]);
        }
    }
}

#[test]
fn a_live_mode_change_precedes_the_next_prompt_only_when_the_native_id_changes() {
    let spawn = base(None, None, None);
    let (session, heard, _) = scripted(&spawn, true, |method| match method {
        "session/new" => json!({"sessionId":"s","modes":offers_auto()}),
        _ => json!({}),
    });
    session.open(&spawn, "", PermissionMode::Ask).unwrap();
    for (wanted, change) in [
        (PermissionMode::Auto, Some("auto")),
        (PermissionMode::Auto, None),
        (PermissionMode::Quiet, Some("default")),
        (PermissionMode::Ask, None),
    ] {
        heard.lock().unwrap().clear();
        session.want_mode(wanted);
        assert!(heard.lock().unwrap().is_empty());
        session
            .send("hi", &crate::harness::event::unbound())
            .unwrap();
        if let Some(id) = change {
            assert_eq!(methods(&heard), ["session/set_mode", "session/prompt"]);
            assert_eq!(heard.lock().unwrap()[0]["params"]["modeId"], id);
        } else {
            assert_eq!(methods(&heard), ["session/prompt"]);
        }
        let id = heard.lock().unwrap().last().unwrap()["id"].clone();
        session.inbound(&json!({"id":id,"result":{"stopReason":"end_turn"}}));
    }
}

#[test]
fn a_load_drops_the_replayed_history_and_sets_model_level_and_mode_again() {
    let spawn = base(Some("old-1"), Some("gemini-3.8-flash"), Some("high"));
    let (session, heard, events) = scripted(&spawn, true, |method| match method {
        "session/load" => json!({"modes": offers_auto()}),
        _ => json!({}),
    });
    // The history a load replays arrives before its reply.
    session.inbound(&json!({ "jsonrpc": "2.0", "method": "session/update", "params": {
        "sessionId": "old-1",
        "update": { "sessionUpdate": "agent_message_chunk", "content": { "type": "text", "text": "old answer" } },
    }}));
    session.open(&spawn, "", PermissionMode::Auto).unwrap();
    assert_eq!(
        methods(&heard),
        [
            "initialize",
            "session/load",
            "session/set_model",
            "session/set_mode"
        ]
    );
    let frames = heard.lock().unwrap().clone();
    assert_eq!(frames[1]["params"]["sessionId"], "old-1");
    assert!(
        frames[1]["params"]["_meta"]["antigravity"]["systemPrompt"]["append"]
            .as_str()
            .unwrap()
            .contains("BypassSandbox: true"),
        "a guarded load gets the terminal instructions too"
    );
    assert_eq!(frames[2]["params"]["modelId"], "gemini-3.8-flash-high");
    assert_eq!(frames[3]["params"]["modeId"], "auto");
    let seen = events.lock().unwrap();
    assert_eq!(seen.len(), 1, "only the session's start: {seen:?}");
}

#[test]
fn a_level_without_a_model_is_set_as_the_thought_level() {
    let spawn = base(None, None, Some("medium"));
    let (session, heard, _) = scripted(&spawn, true, |m| match m {
        "session/new" => json!({ "sessionId": "n" }),
        _ => json!({}),
    });
    session.open(&spawn, "", PermissionMode::Ask).unwrap();
    let frames = heard.lock().unwrap().clone();
    assert_eq!(frames[2]["method"], "session/set_config_option");
    assert_eq!(frames[2]["params"]["configId"], "thought_level");
    assert_eq!(frames[2]["params"]["value"], "medium");
}

#[test]
fn a_model_picked_mid_chat_is_told_with_the_next_prompt_and_only_once() {
    let spawn = base(Some("s"), Some("gemini-3.8-flash"), Some("low"));
    let (session, heard, _) = scripted(&spawn, true, |_| json!({}));
    session.open(&spawn, "", PermissionMode::Ask).unwrap();
    heard.lock().unwrap().clear();
    session.want_model(Some("claude-sonnet-4-6".into()));
    session
        .send("hi", &crate::harness::event::unbound())
        .unwrap();
    assert_eq!(methods(&heard), ["session/set_model", "session/prompt"]);
    assert_eq!(
        heard.lock().unwrap()[0]["params"]["modelId"],
        "claude-sonnet-4-6-low",
        "the session's level rides the slug"
    );
    session.inbound(&json!({ "jsonrpc": "2.0", "id": 6, "result": { "stopReason": "end_turn" } }));
    heard.lock().unwrap().clear();
    session
        .send("again", &crate::harness::event::unbound())
        .unwrap();
    assert_eq!(methods(&heard), ["session/prompt"]);
}

#[test]
fn a_second_prompt_is_never_sent_while_one_is_out() {
    let spawn = base(Some("s"), None, None);
    let (session, heard, _) = scripted(&spawn, true, |_| json!({}));
    session.open(&spawn, "", PermissionMode::Ask).unwrap();
    heard.lock().unwrap().clear();
    let unbound = crate::harness::event::unbound();
    session.send("one", &unbound).unwrap();
    assert!(session.send("two", &unbound).is_err());
    assert_eq!(methods(&heard), ["session/prompt"]);
}

#[test]
fn a_request_the_agent_makes_of_a_client_service_is_refused() {
    let spawn = base(Some("s"), None, None);
    let (session, heard, _) = scripted(&spawn, true, |_| json!({}));
    session.inbound(
        &json!({ "jsonrpc": "2.0", "id": 9, "method": "fs/write_text_file",
                             "params": { "path": "/lib/oculus/courses/x", "content": "x" } }),
    );
    let frames = heard.lock().unwrap().clone();
    assert_eq!(frames[0]["id"], 9);
    assert_eq!(frames[0]["error"]["code"], -32601);
}

#[test]
fn an_agy_older_than_the_recorded_one_is_refused_with_how_to_update() {
    for (version, refused) in [
        ("1.5.8", true),
        ("1.2.9", true),
        ("", true),
        ("dev", true),
        ("1.5.9", false),
        ("1.5.10", false),
        ("2.0.0", false),
    ] {
        assert_eq!(super::session::too_old(version), refused, "{version:?}");
    }
    let spawn = base(None, None, None);
    let (session, heard, events) = scripted(&spawn, true, |method| match method {
        "initialize" => json!({ "agentInfo": { "version": "1.5.8" } }),
        _ => json!({ "sessionId": "n" }),
    });
    let refused = session
        .open(&spawn, "", PermissionMode::Ask)
        .unwrap_err()
        .to_string();
    assert!(refused.contains("1.5.9 or newer"), "{refused}");
    assert!(refused.contains("Settings"), "{refused}");
    assert_eq!(methods(&heard), ["initialize"], "no session was opened");
    assert!(events.lock().unwrap().is_empty());
}

#[test]
fn a_cancel_request_cannot_mask_a_completed_or_failed_prompt_reply() {
    for (reply, expected) in [
        (json!({"result":{"stopReason":"end_turn"}}), "completed"),
        (
            json!({"error":{"code":-32603,"message":"failure"}}),
            "failed",
        ),
    ] {
        let spawn = base(Some("s"), None, None);
        let (session, _, events) = scripted(&spawn, true, |_| json!({}));
        session.open(&spawn, "", PermissionMode::Ask).unwrap();
        session
            .send("one", &crate::harness::event::unbound())
            .unwrap();
        session.interrupt().unwrap();
        let mut reply = reply;
        reply["id"] = json!(4);
        session.inbound(&reply);
        assert!(events.lock().unwrap().iter().any(|e| matches!(e,
            HarnessEvent::TurnFinished { status, .. } if status == expected)));
        session.kill();
    }
}
