//! A launch move that failed or was refused: said in a dialog, and the app
//! closes before its window loads, so nothing runs against a library that
//! is not in this build's layout.

use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

pub fn refuse_to_start(app: &tauri::App, error: &str) {
    use tauri::Manager;
    for window in app.webview_windows().into_values() {
        window.destroy().ok();
    }
    app.dialog()
        .message(format!(
            "Oculus could not finish moving your library into its new folder layout, \
             so it will not start. Nothing was copied, and the move starts or \
             resumes the next time Oculus opens.\n\n{error}"
        ))
        .title("Oculus could not move your library")
        .kind(MessageDialogKind::Error)
        .blocking_show();
    app.handle().exit(1);
}
