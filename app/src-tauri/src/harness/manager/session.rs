//! Bringing a thread's session up and talking to it: send, rewind,
//! interrupt and the sweep on quit. Ending one is `release.rs`.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use crate::harness::antigravity::{AcpSession, AcpSpawn};
use crate::harness::child::ThreadSpawn;
use crate::harness::claude::{ClaudeSession, ClaudeSpawn};
use crate::harness::codex::CodexThreadOpts;
use crate::harness::discover;
use crate::harness::event::Bound;
use crate::harness::opencode::{self, OpencodeSessionOpts};
use crate::harness::providers::capabilities::Capabilities;
use crate::harness::Provider;

use super::handle::{Handle, Live, RewindTo};
use super::instructions::{instructions, thread_cwd, thread_sections};
use super::options::SendOptions;
use super::raw_log::RawLog;
use super::release::Release;
use super::sinks::Sinks;
use super::transition::{decide_transition, Current, Selection, Transition};
use super::Harness;

/// Why a send did not go through.
#[derive(Debug)]
pub enum SendError {
    /// No session could be brought up, or the switch was refused: the
    /// provider heard nothing of the message.
    Unsent(String),
    /// The write to the provider failed, so whether it has the message is
    /// not known.
    Unknown(String),
    /// The provider could not load the saved session. No prompt was sent,
    /// so the send may start a new session and hand the conversation over.
    ResumeFailed(String),
}

impl SendError {
    pub fn into_message(self) -> String {
        match self {
            SendError::Unsent(e) | SendError::Unknown(e) | SendError::ResumeFailed(e) => e,
        }
    }
}

impl From<String> for SendError {
    fn from(e: String) -> Self {
        Self::Unsent(e)
    }
}

impl Harness {
    /// Bring a thread's session up if it is not, then send. `resume` is the
    /// provider's session id from a previous process, if any. A session this
    /// spawns reports to `sinks`.
    pub fn send(
        &self,
        thread_id: i64,
        provider: Provider,
        resume: Option<&str>,
        opts: &SendOptions,
        text: &str,
        sinks: &Arc<dyn Sinks>,
    ) -> Result<(), SendError> {
        // Sent outside the lock: the CLI can take a minute to accept a
        // message, and holding the map would stall every other thread's
        // send and Stop, this thread's Stop included.
        let (handle, generation, sinks, late, before) = {
            let mut live = self.live.lock().unwrap();
            let caps = self.capabilities(provider);
            self.ensure(&mut live, thread_id, (provider, caps), resume, opts, sinks)?;
            let session = live
                .get_mut(&thread_id)
                .ok_or_else(|| SendError::Unsent("no session".into()))?;
            // A video linked after this session came up: its section rides
            // this send, once, whatever the provider.
            let late =
                super::studio::late_section(session.studio.as_ref(), opts.studio_brief.as_ref());
            let before = session.studio.clone();
            if late.is_some() {
                session.studio = opts.studio_brief.clone();
            }
            (
                session.handle.clone(),
                session.generation,
                session.sinks.clone(),
                late,
                before,
            )
        };
        let text = match &late {
            Some(section) => format!("{text}\n\n---\n{section}"),
            None => text.to_owned(),
        };
        // The run this send belongs to is bound to the turn it is accepted as.
        let bound: Bound = Arc::new(move |turn| sinks.bound(generation, turn));
        let sent = handle.send_turn(&text, &bound).map_err(SendError::Unknown);
        if sent.is_err() && late.is_some() {
            // Not known to have arrived: the next send carries it again.
            if let Some(session) = self.live.lock().unwrap().get_mut(&thread_id) {
                if session.generation == generation {
                    session.studio = before;
                }
            }
        }
        sent
    }

    /// A send of `provider` under `opts` would reach the live session the
    /// chat has now, kept or told a new model, rather than one started for
    /// it. The start step asks before writing a prompt (`app/send.rs`).
    pub fn keeps_session(&self, thread_id: i64, provider: Provider, opts: &SendOptions) -> bool {
        let live = self.live.lock().unwrap();
        let caps = self.capabilities(provider);
        let target = selection(provider, opts);
        matches!(
            transition(live.get(&thread_id), &target, opts.permission_mode, &caps),
            Transition::Reuse | Transition::SwitchModelInSession | Transition::SwitchModeInSession
        )
    }

    /// The thread's live session has work running in the background that
    /// would end with it (`Handle::has_background_work`).
    pub fn has_background_work(&self, thread_id: i64) -> bool {
        let live = self.live.lock().unwrap();
        live.get(&thread_id)
            .is_some_and(|l| l.is_alive() && l.handle.has_background_work())
    }

    /// Take a question and everything after it out of the provider's own
    /// session, so the agent's context matches the timeline. A thread whose
    /// process has gone is resumed for this without starting a turn.
    pub fn rewind(
        &self,
        thread_id: i64,
        provider: Provider,
        resume: Option<&str>,
        opts: &SendOptions,
        to: RewindTo,
        sinks: &Arc<dyn Sinks>,
    ) -> Result<(), String> {
        // Rewound outside the lock: it waits on the CLI, and holding the map
        // would stall every other thread's next message.
        let handle = {
            let mut live = self.live.lock().unwrap();
            // Any live session of this provider will do: the model and the
            // reasoning level are irrelevant to a control-channel
            // instruction, so they cause no respawn. Another provider's
            // session gives way, as it would for a send.
            let up = |l: &Live| l.is_alive() && l.selection.provider == provider;
            if !live.get(&thread_id).is_some_and(up) {
                // The question's own provider takes its session back: no
                // handoff is involved, so its bridge need not take one.
                let caps = Capabilities {
                    provider_handoff: true,
                    ..self.capabilities(provider)
                };
                self.ensure(&mut live, thread_id, (provider, caps), resume, opts, sinks)
                    .map_err(SendError::into_message)?;
            }
            live.get(&thread_id).ok_or("no session")?.handle.clone()
        };
        handle.rewind(to)
    }

    /// Make sure this thread has a session of `provider` that can be talked
    /// to under the model and reasoning level asked for. What becomes of a
    /// live one is [`decide_transition`]'s call: kept, told the new model,
    /// or ended for a session spawned or resumed in its place. A new one is
    /// a new [`Generation`](super::Generation), and its sink carries that
    /// number.
    fn ensure(
        &self,
        live: &mut HashMap<i64, Live>,
        thread_id: i64,
        (provider, caps): (Provider, Capabilities),
        resume: Option<&str>,
        opts: &SendOptions,
        sinks: &Arc<dyn Sinks>,
    ) -> Result<(), SendError> {
        let (target, mode) = (selection(provider, opts), opts.permission_mode);
        let transition = transition(live.get(&thread_id), &target, mode, &caps);
        match transition {
            Transition::Reuse => return Ok(()),
            Transition::Reject(reason) => return Err(reason.into()),
            Transition::SwitchModelInSession | Transition::SwitchModeInSession => {
                if let Some(session) = live.get_mut(&thread_id) {
                    if session.selection.model != target.model {
                        session.handle = session.handle.with_model(target.model.clone());
                    }
                    session.handle = session.handle.with_mode(mode);
                    session.selection = target;
                    session.mode = mode;
                }
                return Ok(());
            }
            Transition::RestartAndResume | Transition::CreateWithHandoff => {}
        }
        // A session that died is gone; a live one that cannot take this
        // send as it is has to go before its successor comes up.
        if let Some(old) = live.remove(&thread_id) {
            let reason = match old.is_alive() {
                true => Release::Replaced,
                false => Release::Exited,
            };
            old.end(reason);
        }
        let generation = self.mint();
        let sink = sinks.events(generation);
        #[cfg(test)]
        if self.replay_only {
            let spawn = self
                .replay_spawns
                .lock()
                .unwrap()
                .remove(&(thread_id, provider))
                .expect("unrecorded provider spawn in replay");
            live.insert(
                thread_id,
                Live {
                    handle: spawn(sink, resume, opts)?.with_mode(mode),
                    selection: target,
                    mode,
                    generation,
                    sinks: sinks.clone(),
                    studio: briefed(resume, opts),
                },
            );
            return Ok(());
        }

        let cwd = thread_cwd(&self.data_dir);
        // The cwd and every folder a thread may write, before any CLI grants
        // them (Codex refuses a root that does not exist).
        for dir in std::iter::once(cwd.clone())
            .chain(crate::library::paths::agent_write_dirs(&self.data_dir))
        {
            std::fs::create_dir_all(&dir)
                .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
        }
        // Skills are this build's; sync alone would leave a thread reading the
        // copy an older build wrote.
        if let Err(e) = crate::agents::ensure_library_docs(&self.data_dir) {
            elog!("[oculus] agent docs: {e}");
        }
        let raw_log = RawLog::open(&self.data_dir, thread_id);
        let base = |cwd: PathBuf| -> Result<ThreadSpawn, String> {
            Ok(ThreadSpawn {
                bin: discover::binary(provider)?,
                cwd,
                library: self.data_dir.clone(),
                resume: resume.map(String::from),
                model: opts.model.clone(),
                effort: opts.reasoning_effort.clone(),
                env: discover::child_env(),
                raw_log,
            })
        };
        let handle = match provider {
            Provider::Claude => Handle::Claude(ClaudeSession::spawn(
                ClaudeSpawn {
                    base: self.claude_base(base(cwd)?)?,
                    oculus: discover::oculus_cli(),
                    mode,
                    system_append: instructions(
                        &self.data_dir,
                        opts.scope.as_deref(),
                        opts.lecture.as_ref(),
                        opts.studio_brief.as_ref(),
                    ),
                    one_off: false,
                },
                sink,
            )?),
            Provider::Codex => {
                let server = self.codex_server()?;
                let topts = CodexThreadOpts {
                    cwd,
                    writes_library: true,
                    model: opts.model.clone(),
                    reasoning_effort: opts.reasoning_effort.clone(),
                    instructions: instructions(
                        &self.data_dir,
                        opts.scope.as_deref(),
                        opts.lecture.as_ref(),
                        opts.studio_brief.as_ref(),
                    ),
                    ephemeral: false,
                    mode,
                    library: self.data_dir.clone(),
                };
                let tid = match resume {
                    Some(id) => {
                        server.resume_thread(id, &topts, sink)?;
                        id.to_string()
                    }
                    None => server.start_thread(&topts, sink)?,
                };
                Handle::Codex(server, tid, Arc::new(topts))
            }
            Provider::Opencode => {
                let server = self.opencode_server()?;
                let sopts = OpencodeSessionOpts {
                    model: opts.model.clone(),
                    // Set only when the model declared levels.
                    variant: opts.reasoning_effort.clone(),
                    brief: thread_sections(
                        opts.scope.as_deref(),
                        opts.lecture.as_ref(),
                        opts.studio_brief.as_ref(),
                    ),
                    agent: opencode::AGENT,
                };
                let ses = match resume {
                    Some(id) => {
                        server
                            .attach_session(id, &sopts, sink)
                            .map_err(|e| match e {
                                opencode::AttachError::Missing(e) => SendError::ResumeFailed(e),
                                opencode::AttachError::Failed(e) => SendError::Unsent(e),
                            })?;
                        id.to_string()
                    }
                    None => server.start_session(&sopts, sink)?,
                };
                Handle::Opencode(server, ses)
            }
            Provider::Antigravity => Handle::Antigravity(
                AcpSession::spawn(
                    AcpSpawn {
                        mode,
                        base: base(cwd)?,
                        brief: instructions(
                            &self.data_dir,
                            opts.scope.as_deref(),
                            opts.lecture.as_ref(),
                            opts.studio_brief.as_ref(),
                        ),
                        one_off: false,
                    },
                    self.with_antigravity_rate_limits(sink),
                )
                .map_err(|e| match e {
                    crate::harness::antigravity::acp::OpenError::Load(e) => {
                        SendError::ResumeFailed(e)
                    }
                    e => SendError::Unsent(format!("Antigravity was not started: {e}")),
                })?,
            ),
        };
        live.insert(
            thread_id,
            Live {
                handle,
                selection: target,
                mode,
                generation,
                sinks: sinks.clone(),
                studio: briefed(resume, opts),
            },
        );
        Ok(())
    }

    /// Write a message into the thread's running turn
    /// (`Handle::steer`). Written outside the lock, like a send. A thread
    /// with no live session has no turn to write into.
    pub fn steer(&self, thread_id: i64, text: &str, client: &str) -> super::handle::Steered {
        let handle = {
            let live = self.live.lock().unwrap();
            live.get(&thread_id).map(|l| l.handle.clone())
        };
        match handle {
            Some(handle) => handle.steer(text, client),
            None => super::handle::Steered::Missed,
        }
    }

    /// Ask the thread's CLI to stop its turn. Asked outside the lock, like
    /// a send.
    pub fn interrupt(&self, thread_id: i64) -> Result<(), String> {
        let handle = {
            let live = self.live.lock().unwrap();
            live.get(&thread_id).map(|l| l.handle.clone())
        };
        match handle {
            Some(handle) => handle.interrupt(),
            None => Ok(()),
        }
    }

    /// The threads with a live process of this provider's.
    pub fn live_threads(&self, provider: Provider) -> Vec<i64> {
        self.live
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, l)| l.handle.provider() == provider)
            .map(|(id, _)| *id)
            .collect()
    }

    /// Everything, on quit.
    pub fn shutdown(&self) {
        self.drop_suggestions();
        self.stop_all_one_offs();
        let ids: Vec<i64> = self.live.lock().unwrap().keys().copied().collect();
        for id in ids {
            self.release(id, Release::Quit);
        }
        if let Some(s) = self.codex.lock().unwrap().take() {
            s.kill();
        }
        if let Some(s) = self.opencode.lock().unwrap().take() {
            s.kill();
        }
    }
}

/// The video a newly spawned session's instructions named. A resumed session
/// counts as told about none: not every CLI re-applies instructions on
/// resume, so the first send carries the section again.
fn briefed(resume: Option<&str>, opts: &SendOptions) -> Option<super::studio::StudioBrief> {
    match resume {
        Some(_) => None,
        None => opts.studio_brief.clone(),
    }
}

fn selection(provider: Provider, opts: &SendOptions) -> Selection {
    Selection {
        provider,
        model: opts.model.clone(),
        effort: opts.reasoning_effort.clone(),
    }
}

/// What a send under `target` does to the thread's session, if one is up.
fn transition(
    live: Option<&Live>,
    target: &Selection,
    mode: crate::harness::requests::PermissionMode,
    caps: &Capabilities,
) -> Transition {
    let current = live.filter(|l| l.is_alive()).map(|l| Current {
        selection: &l.selection,
        mode: l.mode,
        background: l.handle.has_background_work(),
        pending_request: l.handle.has_pending_request(),
    });
    decide_transition(current, (target, mode), caps)
}
