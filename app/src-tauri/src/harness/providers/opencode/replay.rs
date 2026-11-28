use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use serde_json::json;

use crate::harness::child::ChildProc;
use crate::harness::manager::Handle;
use crate::harness::testkit::{outbound::Outbound, replay::Bridge};
use crate::harness::Sink;

use super::{
    server::OpencodeServer,
    session::{SessionRoute, SessionState},
};

pub(in crate::harness) fn bridge(outbound: Outbound, sink: Sink, id: &str, root: &Path) -> Bridge {
    let pipe = outbound.clone();
    let server = Arc::new(OpencodeServer {
        proc: ChildProc::replay(Arc::new(move |frame| pipe.try_exchange(frame).map(|_| ()))),
        replay: Some(Arc::new(move |method, path, body| {
            outbound.exchange(json!({"method": method, "path": path, "body": body}))
        })),
        base: "replay://no-network".into(),
        directory: root.join("agents"),
        api: ureq::AgentBuilder::new().build(),
        stream: ureq::AgentBuilder::new().build(),
        routes: Mutex::new(HashMap::new()),
        default_sink: Some(sink.clone()),
        raw_log: None,
    });
    server.route(
        id,
        SessionRoute {
            sink,
            agent: "oculus",
            model: Mutex::new(None),
            variant: None,
            state: Mutex::new(SessionState::default()),
        },
    );
    let (reader, closing) = (server.clone(), server.clone());
    Bridge {
        handle: Handle::Opencode(server, id.into()),
        inbound: Box::new(move |frame| reader.dispatch(frame)),
        eof: Box::new(move || closing.on_exit()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::harness::opencode::{AttachError, OpencodeSessionOpts};

    /// A server whose every `GET` answers `answer`.
    fn answering(answer: serde_json::Value) -> OpencodeServer {
        OpencodeServer {
            proc: ChildProc::replay(Arc::new(|_| Ok(()))),
            replay: Some(Arc::new(move |_, _, _| answer.clone())),
            base: "replay://no-network".into(),
            directory: crate::agents::agents_dir(Path::new("/lib")),
            api: ureq::AgentBuilder::new().build(),
            stream: ureq::AgentBuilder::new().build(),
            routes: Mutex::new(HashMap::new()),
            default_sink: None,
            raw_log: None,
        }
    }

    fn attach(server: &OpencodeServer) -> Result<(), AttachError> {
        let opts = OpencodeSessionOpts {
            model: None,
            variant: None,
            brief: String::new(),
            agent: "oculus",
        };
        server.attach_session("ses_saved", &opts, Arc::new(|_| {}))
    }

    /// opencode keeps each session's folder, so one saved before the
    /// workspace moved may not be found from the new one: that is a failed
    /// resume, which the send recovers from with a fresh session.
    #[test]
    fn a_session_opencode_does_not_have_is_missing_not_a_failed_send() {
        for answer in [
            serde_json::Value::Null,
            json!({}),
            json!({"id": "ses_other"}),
        ] {
            let error = attach(&answering(answer.clone())).unwrap_err();
            assert!(
                matches!(&error, AttachError::Missing(e) if e.contains("ses_saved")),
                "{answer}: {error:?}"
            );
        }
        attach(&answering(json!({"id": "ses_saved"}))).unwrap();
    }
}
