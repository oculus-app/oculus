//! Moving a file or folder to the system's Trash (the Recycle Bin on
//! Windows), so a delete the user asked for can be put back. One mechanism
//! for every caller: Studio's renders and videos, and Drive's deletes.

use std::path::{Path, PathBuf};

/// What the platform calls it, for error sentences.
pub const BIN: &str = if cfg!(windows) {
    "Recycle Bin"
} else {
    "Trash"
};

/// Move `path` to the Trash; returns where it is now when the platform says
/// (macOS), which is what lets a caller move it back. On macOS through
/// `NSFileManager`, which neither drives Finder nor asks for Automation
/// permission; elsewhere through the `trash` crate (the Recycle Bin's own
/// API on Windows). A volume with no Trash is an error: nothing is unlinked.
pub fn trash_item(path: &Path) -> Result<Option<PathBuf>, String> {
    let failed = |error: &dyn std::fmt::Display| {
        format!("Could not move {} to the {BIN}: {error}", path.display())
    };
    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::{NSFileManager, NSString, NSURL};

        let url = NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy()));
        let mut landed = None;
        NSFileManager::defaultManager()
            .trashItemAtURL_resultingItemURL_error(&url, Some(&mut landed))
            .map_err(|error| failed(&error.localizedDescription()))?;
        Ok(landed
            .and_then(|url| url.path())
            .map(|p| PathBuf::from(p.to_string())))
    }
    #[cfg(not(target_os = "macos"))]
    {
        trash::delete(path).map_err(|error| failed(&error))?;
        Ok(None)
    }
}

/// `trash_item` for a caller that needs no way back (Studio).
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    trash_item(path).map(|_| ())
}
