use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use crate::studio::narrate::running::{self, NARRATIONS};
use crate::studio::render::{self, Preset, RENDERS};

// Serialise job claims with video.json edits, releasing the lock before any job runs.
static ACTIONS: Mutex<()> = Mutex::new(());

pub(in crate::studio::commands) fn start_render(
    dir: &Path,
    preset: Preset,
) -> Result<render::Running<'static>, String> {
    let _action = lock();
    let running = RENDERS.start(dir, preset)?;
    check_narration(dir)?;
    Ok(running)
}

pub(super) fn start_narration(dir: &Path) -> Result<running::Running<'static>, String> {
    let _action = lock();
    let running = NARRATIONS.start(dir)?;
    check_render(dir)?;
    Ok(running)
}

pub(super) fn edit(dir: &Path, edit: impl FnOnce() -> Result<(), String>) -> Result<(), String> {
    let _action = lock();
    check_narration(dir)?;
    check_render(dir)?;
    edit()
}

/// Runs `delete` while nothing renders or narrates the folder, and holds
/// off a new job until it returns.
pub(super) fn delete(
    dir: &Path,
    delete: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let _action = lock();
    check_narration(dir)?;
    RENDERS.while_idle(dir, delete)
}

pub(super) fn lock() -> MutexGuard<'static, ()> {
    ACTIONS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn check_narration(dir: &Path) -> Result<(), String> {
    if NARRATIONS.running(dir) {
        return Err(running::BUSY.to_owned());
    }
    Ok(())
}

fn check_render(dir: &Path) -> Result<(), String> {
    if let Some(preset) = RENDERS.running(dir) {
        return Err(format!(
            "a {} render of this video is running; wait for it or cancel it",
            preset.name()
        ));
    }
    Ok(())
}
