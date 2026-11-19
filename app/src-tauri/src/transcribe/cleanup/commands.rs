//! The Tauri commands: the cleanup itself, the warm-up a recording's start
//! asks for, and S1-mini's status, download and removal for Settings →
//! Transcription. Nothing here but `dictation_cleanup` calls Groq's chat
//! endpoint; the status reads keyd or the keychain and the disk only.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::s1::{self, model, server, S1};
use super::{groq, run, GroqRoute};
use crate::runtime::download_events::download_with_events;
use crate::runtime::onnx::{self, Status};
use crate::transcribe::engines::groq::Groq;

/// Display only, never persisted.
pub const S1_PROGRESS_EVENT: &str = "dictation-s1-progress";

const MAX_TRANSCRIPT_BYTES: usize = 100_000;

/// Whisper's code for the transcription language in Settings: `en`, `auto`
/// or another.
fn language() -> String {
    crate::transcribe::settings_from(crate::db::store::setting_blocking("transcribe").as_deref())
        .language
        .whisper()
}

fn groq_route() -> GroqRoute<Groq> {
    match crate::transcribe::settings::groq_auth(
        &crate::library::paths::data_dir(),
        crate::providers::groq::fetch_api_key,
    ) {
        Ok(Some(auth)) => GroqRoute::Ready(Groq::new(auth, None)),
        Ok(None) => GroqRoute::NoKey,
        Err(e) => GroqRoute::Unreadable(e),
    }
}

fn resource_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok()
}

/// The transcript as the message the speaker meant: Groq when it has a key,
/// else S1-mini, S1-mini again when Groq fails. Empty is a valid answer for
/// filler-only speech.
#[tauri::command]
pub async fn dictation_cleanup(app: AppHandle, transcript: String) -> Result<String, String> {
    let transcript = transcript.trim().to_string();
    if transcript.is_empty() || transcript.len() > MAX_TRANSCRIPT_BYTES {
        return Err("Dictation must contain between 1 and 100,000 bytes of text.".into());
    }
    let resource_dir = resource_dir(&app);
    crate::runtime::blocking::run(move || {
        let s1 = S1::installed(resource_dir, language());
        run(groq_route(), s1, &transcript)
    })
    .await
}

/// Load S1-mini now, when a recording starts, so its cleanup finds it ready.
/// Does nothing when Groq has a key, S1-mini is not installed, or the
/// transcription language is not English.
#[tauri::command]
pub async fn dictation_warm(app: AppHandle) -> Result<(), String> {
    let resource_dir = resource_dir(&app);
    crate::runtime::blocking::run(move || {
        if matches!(crate::providers::groq::KEY.has(), Ok(true)) {
            return Ok(());
        }
        let language = language();
        if !s1::would_run(&language) {
            return Ok(());
        }
        match S1::installed(resource_dir, language) {
            Some(s1) => server::warm(&s1.completer),
            None => Ok(()),
        }
    })
    .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupStatus {
    /// What a cleanup tries first: `groq`, `s1Mini`, or `none` when neither
    /// is set up (a cleanup then fails with what to do).
    pub engine: &'static str,
    pub groq: GroqStatus,
    pub s1_mini: S1Status,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroqStatus {
    /// A Groq API key is saved (Settings → Transcription's key).
    pub configured: bool,
    pub model: &'static str,
    /// keyd or the keychain refused to say whether a key is saved.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct S1Status {
    /// "S1-mini" and "Superwhisper": the licence requires this name, as written.
    pub name: &'static str,
    pub by: &'static str,
    /// "S1-mini by Superwhisper".
    pub label: String,
    /// `missing`, `downloading` or `present`.
    pub status: Status,
    /// The model with its licence and notice.
    pub bytes: u64,
    /// Why it cannot run here (another OS, or a dev checkout without the
    /// helper); `None` when it can.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable: Option<&'static str>,
    /// Its server is loaded right now.
    pub running: bool,
    /// S1-mini cleans English only; other speech is left as heard.
    pub english_only: bool,
}

/// Which engine a cleanup would use and S1-mini's state. Reads keyd or the
/// keychain and the disk; never calls Groq's chat endpoint.
#[tauri::command]
pub async fn dictation_cleanup_status(app: AppHandle) -> Result<CleanupStatus, String> {
    let resource_dir = resource_dir(&app);
    crate::runtime::blocking::run(move || {
        let (configured, error) = match crate::providers::groq::KEY.has() {
            Ok(has) => (has, None),
            Err(e) => (false, Some(e)),
        };
        let unavailable = s1::unavailable(resource_dir);
        let status = onnx::status(&model::dir(), &model::PACK);
        let s1_ready = unavailable.is_none() && status == Status::Present;
        Ok(CleanupStatus {
            engine: match (configured, s1_ready) {
                (true, _) => "groq",
                (false, true) => "s1Mini",
                (false, false) => "none",
            },
            groq: GroqStatus {
                configured,
                model: groq::MODEL,
                error,
            },
            s1_mini: S1Status {
                name: model::NAME,
                by: model::BY,
                label: format!("{} by {}", model::NAME, model::BY),
                status,
                bytes: model::PACK.bytes(),
                unavailable,
                running: server::running(),
                english_only: true,
            },
        })
    })
    .await
}

/// Download S1-mini with its licence and notice, resolving when all three
/// are on disk; progress arrives as `dictation-s1-progress`. A cancel rejects
/// with `cancelled`.
#[tauri::command]
pub async fn dictation_s1_download(app: AppHandle) -> Result<(), String> {
    if !s1::SUPPORTED {
        return Err(s1::unavailable(None).unwrap_or_default().into());
    }
    crate::runtime::blocking::run(move || {
        let dir = model::dir();
        download_with_events(
            &app,
            S1_PROGRESS_EVENT,
            None,
            "S1-mini",
            &dir,
            model::PACK.bytes(),
            |progress| onnx::download(&dir, &model::PACK, progress, || false),
        )
    })
    .await
}

/// Ask the in-flight download to stop; false when none runs.
#[tauri::command]
pub fn dictation_s1_cancel() -> bool {
    onnx::cancel(model::PACK.id)
}

/// Stop S1-mini's server and delete its files and any partial download;
/// returns the bytes freed.
#[tauri::command]
pub async fn dictation_s1_remove() -> Result<u64, String> {
    crate::runtime::blocking::run(|| {
        server::stop();
        let dir = model::dir();
        let freed = onnx::delete(&dir, &model::PACK)?;
        std::fs::remove_file(dir.join(model::LOG_FILE)).ok();
        Ok(freed)
    })
    .await
}

/// Stop S1-mini's server, if one runs; on app exit.
pub fn shutdown() {
    server::stop();
}

/// End S1-mini servers a killed app left behind; once, at launch.
pub fn sweep_strays() {
    let found = s1::sweep();
    if !found.is_empty() {
        elog!(
            "[oculus] ended {} stray S1-mini server process(es)",
            found.len()
        );
    }
}
