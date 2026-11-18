//! `oculus-core`: everything the agent harness (`harness_root.rs`) and the app
//! shell (`lib.rs`) build on. Its own manifest is `crates/oculus-core/`; its
//! modules stay here under `src/`, so an edit to the harness or the shell
//! never recompiles them (docs/development.md#the-rust-crates).
//!
//! Core names nothing above it. The few calls it makes up go through
//! [`runtime::upper`], which `app_lib::bind_layers` fills in.

#[macro_use]
mod elog;

pub mod agents;
pub mod auth;
pub mod db;
pub mod embed;
pub mod library;
pub mod pages;
pub mod parse;
pub mod providers;
pub mod revision;
pub mod runtime;
pub mod sources;
pub mod studio;
pub mod sync;
#[cfg(any(test, feature = "test-support"))]
pub mod test_support;
pub mod transcribe;

/// Files of the upper crates' modules that core uses, compiled here at the
/// same module path so a `crate::harness::attach` reads alike in every crate.
/// The owning module re-exports each (`pub use oculus_core::harness::attach`).
pub mod harness {
    pub mod attach;
}

/// See [`harness`].
pub mod widgets {
    pub mod check;
    pub mod transpile;
}

/// See [`harness`].
pub mod companion {
    pub mod assets {
        pub mod mime;
    }
}

/// See [`harness`].
pub mod shell {
    pub mod browser {
        mod labels;
        pub mod scope;

        pub use labels::{LABEL_PREFIX, MAIN};
    }
}
