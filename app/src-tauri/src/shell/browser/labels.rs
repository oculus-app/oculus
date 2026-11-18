//! The labels of the main webview and of the browser's page webviews.

/// The window every page lives in, and the webview that hears about them.
pub const MAIN: &str = "main";
/// Page webviews are `browse-<tab id>`. Not in any capability: they hold
/// remote content and must reach no Tauri command.
pub const LABEL_PREFIX: &str = "browse-";
