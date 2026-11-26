//! A recorded `agy acp` session, opened already: the replay starts at the
//! first prompt. A request of ours other than `session/prompt` is answered
//! with its manifest response as it is written; a prompt's reply is in the
//! recording. `$LIBRARY` in a recorded frame is the replay's library.

use std::path::Path;
use std::sync::{Arc, Weak};

use crate::harness::requests::PermissionMode;
use serde_json::{json, Value};

use crate::harness::child::{ChildProc, ThreadSpawn};
use crate::harness::manager::Handle;
use crate::harness::testkit::{outbound::Outbound, replay::Bridge};
use crate::harness::Sink;

use super::session::AcpSession;

/// `frame` with `$LIBRARY` in its strings replaced by `root`.
pub(in crate::harness) fn place(frame: &Value, root: &Path) -> Value {
    match frame {
        Value::String(s) => Value::String(s.replace("$LIBRARY", &root.display().to_string())),
        Value::Array(a) => a.iter().map(|v| place(v, root)).collect(),
        Value::Object(o) => o.iter().map(|(k, v)| (k.clone(), place(v, root))).collect(),
        v => v.clone(),
    }
}

/// The recorded session, with nothing under a raw log, with its native mode, or
/// a one-off turn when no chat mode is supplied.
pub(in crate::harness) fn session(
    outbound: Outbound,
    sink: Sink,
    native_session: &str,
    root: &Path,
    chat_mode: Option<&str>,
) -> Arc<AcpSession> {
    let first_id = outbound.next_rpc_id().unwrap_or(1);
    let base = ThreadSpawn {
        bin: "agy".into(),
        cwd: root.join("agents"),
        library: root.to_path_buf(),
        resume: Some(native_session.to_string()),
        model: None,
        effort: None,
        env: Vec::new(),
        raw_log: None,
    };
    let reply_to: Arc<std::sync::Mutex<Weak<AcpSession>>> = Arc::default();
    let replier = reply_to.clone();
    let proc = ChildProc::replay(Arc::new(move |frame: Value| {
        let response = outbound.try_exchange(frame.clone())?;
        let ours = frame.get("method").is_some() && frame.get("id").is_some();
        if ours && frame["method"] != "session/prompt" {
            if let Some(session) = replier.lock().unwrap().upgrade() {
                session.rpc_reply(json!({ "id": frame["id"], "result": response }));
            }
        }
        Ok(())
    }));
    let session = AcpSession::new(proc, first_id, sink, &base, chat_mode.is_none(), true);
    *reply_to.lock().unwrap() = Arc::downgrade(&session);
    session.opened_for_replay(chat_mode == Some("auto"));
    session
}

pub(in crate::harness) fn bridge(
    outbound: Outbound,
    sink: Sink,
    native_session: &str,
    root: &Path,
    mode: &str,
) -> Bridge {
    let session = session(outbound, sink, native_session, root, Some(mode));
    let (reading, closing, root) = (session.clone(), session.clone(), root.to_path_buf());
    Bridge {
        handle: Handle::Antigravity(session),
        inbound: Box::new(move |frame| reading.inbound(&place(frame, &root))),
        eof: Box::new(move || closing.closed()),
    }
}

/// Synthetic setup replay: unlike captured turn excerpts this drives the
/// production initialize/load/new path, including explicit RPC errors.
pub(in crate::harness) fn open_session(
    outbound: Outbound,
    sink: Sink,
    resume: Option<&str>,
    root: &Path,
) -> Result<Arc<AcpSession>, super::OpenError> {
    open_session_with_options(outbound, sink, resume, root, &Default::default())
}

pub(in crate::harness) fn opening_with_options(
    outbound: Outbound,
    sink: Sink,
    resume: Option<&str>,
    root: &Path,
    opts: &crate::harness::SendOptions,
) -> Result<Bridge, super::OpenError> {
    let session = open_session_with_options(outbound, sink, resume, root, opts)?;
    let (reading, closing, root) = (session.clone(), session.clone(), root.to_path_buf());
    Ok(Bridge {
        handle: Handle::Antigravity(session),
        inbound: Box::new(move |frame| reading.inbound(&place(frame, &root))),
        eof: Box::new(move || closing.closed()),
    })
}

fn open_session_with_options(
    outbound: Outbound,
    sink: Sink,
    resume: Option<&str>,
    root: &Path,
    opts: &crate::harness::SendOptions,
) -> Result<Arc<AcpSession>, super::OpenError> {
    let base = ThreadSpawn {
        bin: "agy".into(),
        cwd: root.join("agents"),
        library: root.into(),
        resume: resume.map(String::from),
        model: opts.model.clone(),
        effort: opts.reasoning_effort.clone(),
        env: Vec::new(),
        raw_log: None,
    };
    let reply_to: Arc<std::sync::Mutex<Weak<AcpSession>>> = Arc::default();
    let replier = reply_to.clone();
    let proc = ChildProc::replay(Arc::new(move |frame: Value| {
        let response = outbound.try_exchange(frame.clone())?;
        if frame.get("method").is_some() && frame["method"] != "session/prompt" {
            if let Some(s) = replier.lock().unwrap().upgrade() {
                let reply = match response.get("error") {
                    Some(error) => json!({"id":frame["id"], "error":error}),
                    None => json!({"id":frame["id"], "result":response}),
                };
                s.rpc_reply(reply);
            }
        }
        Ok(())
    }));
    let session = AcpSession::new(proc, 1, sink, &base, false, false);
    *reply_to.lock().unwrap() = Arc::downgrade(&session);
    if let Err(e) = session.open(&base, "", PermissionMode::Ask) {
        session.kill();
        return Err(e);
    }
    Ok(session)
}
