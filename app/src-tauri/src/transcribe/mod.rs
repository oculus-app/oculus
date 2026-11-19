//! Transcription: a video in the library into a WebVTT file beside it
//! (`<video>.vtt`), for recordings that arrive without captions.
//!
//! The pipeline — audio extraction, chunking, offsets, the VTT — belongs to
//! this module; an [`Engine`] only turns one audio file into timed segments.
//! Engines — Groq's hosted Whisper, whisper.cpp with a downloaded model, and
//! Apple's on-device recogniser — are tried in the order set in Settings →
//! Transcription ([`Settings`]). A later engine answers only when an earlier
//! one is unconfigured or rate-limited; any other failure surfaces
//!
//! Microphone clips take the same engines (`dictation`); `cleanup` turns
//! their transcript into the message the speaker meant. `groq_usage` keeps
//! what Groq's answers said of its allowance.

pub mod app;
pub(crate) mod audio;
pub mod cleanup;
pub mod dictation;
mod engine;
mod engines;
pub mod groq_usage;
mod pipeline;
mod settings;
mod vtt;

pub use engine::{engine_label, Engine, EngineError, Segment, ENGINES};
pub use engines::whisper_models;
pub use pipeline::{resolve, run, vtt_path, Outcome, Step};
pub(crate) use settings::{settings_from, Settings};
