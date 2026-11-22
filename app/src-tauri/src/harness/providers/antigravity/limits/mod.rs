//! Account quota reads for the composer's usage ring.

mod credentials;
mod summary;
#[cfg(test)]
mod tests;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use chrono::Utc;

use crate::harness::event::RateWindow;
use crate::harness::{HarnessEvent, Sink};

use credentials::Credentials;
use summary::{map_windows, Summary};

const DAILY: &str = "https://daily-cloudcode-pa.googleapis.com";
const PROD: &str = "https://cloudcode-pa.googleapis.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

static PROBING: AtomicBool = AtomicBool::new(false);

struct ProbeGuard;

impl Drop for ProbeGuard {
    fn drop(&mut self) {
        PROBING.store(false, Ordering::Release);
    }
}

/// Turn ends and page opens share one worker and one account sink.
pub(in crate::harness) fn refresh(sink: Sink) {
    if PROBING.swap(true, Ordering::Acquire) {
        return;
    }
    let guard = ProbeGuard;
    if let Err(e) = std::thread::Builder::new()
        .name("antigravity-quota".into())
        .spawn(move || {
            let _guard = guard;
            let windows = probe();
            if !windows.is_empty() {
                sink(HarnessEvent::RateLimits { windows });
            }
        })
    {
        elog!("[oculus] antigravity quota worker: {e}");
    }
}

fn probe() -> Vec<RateWindow> {
    let Some(credentials) = Credentials::load() else {
        return Vec::new();
    };
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout_connect(REQUEST_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        .user_agent(&user_agent())
        .build();
    let bearer = format!("Bearer {}", credentials.token.access_token);
    let summaries = hosts(credentials.auth_method.as_deref())
        .into_iter()
        .filter_map(|host| {
            let requested_at = Utc::now();
            let summary = request(&agent, host, &bearer)?;
            Some((summary, requested_at))
        });
    map_windows(summaries)
}

fn hosts(auth_method: Option<&str>) -> [&'static str; 2] {
    match auth_method {
        Some("consumer" | "personal" | "oauth-personal") => [DAILY, PROD],
        _ => [PROD, DAILY],
    }
}

fn user_agent() -> String {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        os => os,
    };
    let arch = match std::env::consts::ARCH {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        "x86" => "ia32",
        arch => arch,
    };
    format!("antigravity/hub/2.24.0 (aidev_client; os_type={os}; arch={arch}; cl=963137146)")
}

fn request(agent: &ureq::Agent, host: &str, bearer: &str) -> Option<Summary> {
    let response = agent
        .post(&format!("{host}/v1internal:retrieveUserQuotaSummary"))
        .set("Authorization", bearer)
        .set("Content-Type", "application/json")
        .send_string("{}")
        .ok()?;
    if !(200..300).contains(&response.status()) {
        return None;
    }
    serde_json::from_str(&response.into_string().ok()?).ok()
}
