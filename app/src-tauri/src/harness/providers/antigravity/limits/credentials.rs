#[cfg(any(target_os = "macos", test))]
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{DateTime, TimeDelta, Utc};
use serde::Deserialize;

#[derive(Deserialize)]
pub(super) struct Credentials {
    pub(super) token: Token,
    pub(super) auth_method: Option<String>,
}

#[derive(Deserialize)]
pub(super) struct Token {
    pub(super) access_token: String,
    expiry: Option<String>,
}

impl Credentials {
    pub(super) fn load() -> Option<Self> {
        #[cfg(target_os = "macos")]
        if let Some(secret) = keychain() {
            return Self::parse(&decode_keyring(&secret)?, Utc::now());
        }
        let path = dirs::home_dir()?.join(".gemini/antigravity-cli/antigravity-oauth-token");
        Self::parse(&std::fs::read(path).ok()?, Utc::now())
    }

    pub(super) fn parse(bytes: &[u8], now: DateTime<Utc>) -> Option<Self> {
        let credentials: Self = serde_json::from_slice(bytes).ok()?;
        let expiry = DateTime::parse_from_rfc3339(credentials.token.expiry.as_deref()?).ok()?;
        // agy renews its own token on its next turn.
        if credentials.token.access_token.is_empty()
            || expiry.signed_duration_since(now) <= TimeDelta::seconds(60)
        {
            return None;
        }
        Some(credentials)
    }
}

#[cfg(target_os = "macos")]
fn keychain() -> Option<Vec<u8>> {
    // The item's ACL trusts the security tool.
    let output = std::process::Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-s",
            "gemini",
            "-a",
            "antigravity",
            "-w",
        ])
        .output()
        .ok()?;
    output.status.success().then_some(output.stdout)
}

#[cfg(any(target_os = "macos", test))]
pub(super) fn decode_keyring(secret: &[u8]) -> Option<Vec<u8>> {
    let text = std::str::from_utf8(secret).ok()?.trim();
    if let Some(value) = text.strip_prefix("go-keyring-base64:") {
        return STANDARD.decode(value).ok();
    }
    if let Some(value) = text.strip_prefix("go-keyring-encoded:") {
        if !value.len().is_multiple_of(2) || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        return (0..value.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&value[i..i + 2], 16).ok())
            .collect();
    }
    Some(text.as_bytes().to_vec())
}
