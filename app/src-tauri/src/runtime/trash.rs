//! Moving a file or folder to the system's Trash (the Recycle Bin on
//! Windows), so a delete the user asked for can be put back.

use std::path::Path;

/// What the platform calls it, for error sentences.
const BIN: &str = if cfg!(windows) {
    "Recycle Bin"
} else {
    "Trash"
};

/// On macOS through `NSFileManager`, which neither drives Finder nor asks
/// for Automation permission.
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    let context = trash::TrashContext::new();
    #[cfg(target_os = "macos")]
    let context = {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};

        let mut context = context;
        context.set_delete_method(DeleteMethod::NsFileManager);
        context
    };
    context
        .delete(path)
        .map_err(|error| format!("Could not move {} to the {BIN}: {error}", path.display()))
}
