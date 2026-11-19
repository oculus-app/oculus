//! Chat widgets (`docs/widgets.md`): the agent's TSX is transpiled and
//! checked here, the widget kit is served to the sandboxed frames from the
//! media server, and a widget's `ask` is answered by a model.

pub mod ask;
pub use oculus_core::widgets::check;
pub mod commands;
pub mod kit;
pub use oculus_core::widgets::transpile;
