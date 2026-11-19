//! `oculus-harness`: the CLI agents as the app's chat, and what runs through
//! them — lecture jobs, chat widgets and proposals. Its own manifest is
//! `crates/oculus-harness/`; its modules stay here under `src/`
//! (docs/development.md#the-rust-crates).
//!
//! Core's modules are re-exported whole, so `crate::db` and the rest resolve
//! here as they do in core.

#[macro_use(elog)]
extern crate oculus_core;

pub use oculus_core::*;

pub mod harness;
pub mod lectures;
pub mod proposals;
pub mod widgets;
