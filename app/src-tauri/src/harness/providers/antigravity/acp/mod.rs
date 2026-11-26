//! Antigravity over the Agent Client Protocol: one `agy acp` process per
//! chat, JSON-RPC over stdio ([`client`]). A chat opens a session
//! (`session/new`, or `session/load` with the id print mode and ACP share),
//! sets its model, level and mode after each, and sends each message as one
//! `session/prompt` whose reply ends the turn ([`updates`]). Stop is
//! `session/cancel`. In `default` every write and command asks; native Auto
//! decides which to forward. Rust answers `session/request_permission` first
//! ([`policy`]) and the student answers through `requests/` otherwise
//! ([`route`]). The student's own agy rules play no part: agy does not
//! apply them under ACP. docs/harness.md, "Antigravity runs over ACP".

mod client;
mod guard;
mod policy;
#[cfg(test)]
mod question_tests;
mod questions;
mod route;
mod session;
mod updates;

#[cfg(test)]
pub(in crate::harness) mod replay;
#[cfg(test)]
mod tests;

pub use session::{AcpSession, AcpSpawn, OpenError};
