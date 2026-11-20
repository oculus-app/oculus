//! How much of Groq's allowance is left, as its last answers said: each
//! successful response's `x-ratelimit-*` headers (requests per day, tokens
//! per minute, per model; https://console.groq.com/docs/rate-limits), the
//! latest reading per model, in memory only. Reading it never calls Groq.
//! Audio seconds per day, Whisper's real cap, has no header, so it is absent.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

/// What the model was asked to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Role {
    Transcription,
    Cleanup,
}

/// One response's headers. A header that is missing or unreadable leaves its
/// field `None`. Resets are seconds after `read_at`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reading {
    pub model: String,
    pub role: Role,
    /// Requests per day.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests_limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests_remaining: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests_reset: Option<f64>,
    /// Tokens per minute.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_remaining: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tokens_reset: Option<f64>,
    /// Milliseconds since the Unix epoch.
    pub read_at: u64,
}

impl Reading {
    /// The rate-limit headers of one response (names in any case), or `None`
    /// when it carries none of them.
    pub fn from_headers(
        role: Role,
        model: &str,
        headers: &[(String, String)],
        read_at: u64,
    ) -> Option<Self> {
        let header = |name: &str| {
            headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(name))
                .map(|(_, v)| v.trim())
        };
        let count = |name: &str| header(name).and_then(|v| v.parse::<u64>().ok());
        let reset = |name: &str| header(name).and_then(duration_secs);
        let reading = Self {
            model: model.to_string(),
            role,
            requests_limit: count("x-ratelimit-limit-requests"),
            requests_remaining: count("x-ratelimit-remaining-requests"),
            requests_reset: reset("x-ratelimit-reset-requests"),
            tokens_limit: count("x-ratelimit-limit-tokens"),
            tokens_remaining: count("x-ratelimit-remaining-tokens"),
            tokens_reset: reset("x-ratelimit-reset-tokens"),
            read_at,
        };
        let any = reading.requests_limit.is_some()
            || reading.requests_remaining.is_some()
            || reading.requests_reset.is_some()
            || reading.tokens_limit.is_some()
            || reading.tokens_remaining.is_some()
            || reading.tokens_reset.is_some();
        any.then_some(reading)
    }
}

/// Groq's reset durations in seconds: `7.66s`, `2m59.56s`, `1h2m3s`, `120ms`.
pub fn duration_secs(text: &str) -> Option<f64> {
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    let mut total = 0.0;
    let mut rest = text;
    while !rest.is_empty() {
        let digits = rest
            .find(|c: char| !(c.is_ascii_digit() || c == '.'))
            .unwrap_or(rest.len());
        let value: f64 = rest[..digits].parse().ok()?;
        rest = &rest[digits..];
        let unit = rest
            .find(|c: char| c.is_ascii_digit() || c == '.')
            .unwrap_or(rest.len());
        total += value
            * match &rest[..unit] {
                "h" => 3600.0,
                "m" => 60.0,
                "s" => 1.0,
                "ms" => 0.001,
                _ => return None,
            };
        rest = &rest[unit..];
    }
    Some(total)
}

/// Readings in the order they were taken; `seq` lets a caller ask for those
/// taken after a mark.
struct Store {
    seq: u64,
    readings: BTreeMap<String, (u64, Reading)>,
}

static STORE: Mutex<Store> = Mutex::new(Store {
    seq: 0,
    readings: BTreeMap::new(),
});

fn store() -> std::sync::MutexGuard<'static, Store> {
    STORE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Keep a successful response's reading as `model`'s latest.
pub fn record(role: Role, model: &str, headers: &[(String, String)]) {
    if let Some(reading) = Reading::from_headers(role, model, headers, now_ms()) {
        let mut store = store();
        store.seq += 1;
        let seq = store.seq;
        store.readings.insert(model.to_string(), (seq, reading));
    }
}

/// A point to ask [`since`] from.
pub fn mark() -> u64 {
    store().seq
}

/// `model`'s latest reading if it was taken after `mark`.
pub fn since(model: &str, mark: u64) -> Option<Reading> {
    store()
        .readings
        .get(model)
        .filter(|(seq, _)| *seq > mark)
        .map(|(_, reading)| reading.clone())
}

#[derive(Debug, Serialize)]
pub struct Usage {
    pub models: Vec<Reading>,
}

/// The latest reading of every Groq model used since launch. Reads memory
/// only; never calls Groq.
#[tauri::command]
pub fn groq_usage() -> Usage {
    Usage {
        models: store()
            .readings
            .values()
            .map(|(_, reading)| reading.clone())
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn resets_read_groqs_duration_formats() {
        assert_eq!(duration_secs("7.66s"), Some(7.66));
        assert!((duration_secs("2m59.56s").unwrap() - 179.56).abs() < 1e-9);
        assert_eq!(duration_secs("1h2m3s"), Some(3723.0));
        assert_eq!(duration_secs("120ms"), Some(0.12));
        assert_eq!(duration_secs(" 30s "), Some(30.0));
        for bad in ["", "soon", "7", "7.66", "2x", "m5s"] {
            assert_eq!(duration_secs(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_response_with_every_header_reads_each() {
        let reading = Reading::from_headers(
            Role::Cleanup,
            "qwen/qwen3.8-27b",
            &headers(&[
                ("X-RateLimit-Limit-Requests", "2000"),
                ("x-ratelimit-remaining-requests", "1996"),
                ("x-ratelimit-reset-requests", "2m59.56s"),
                ("x-ratelimit-limit-tokens", "6000"),
                ("x-ratelimit-remaining-tokens", "5800"),
                ("x-ratelimit-reset-tokens", "7.66s"),
                ("content-type", "application/json"),
            ]),
            42,
        )
        .unwrap();
        assert_eq!(reading.requests_limit, Some(2000));
        assert_eq!(reading.requests_remaining, Some(1996));
        assert!((reading.requests_reset.unwrap() - 179.56).abs() < 1e-9);
        assert_eq!(reading.tokens_limit, Some(6000));
        assert_eq!(reading.tokens_remaining, Some(5800));
        assert_eq!(reading.tokens_reset, Some(7.66));
        assert_eq!(reading.read_at, 42);
        let wire = serde_json::to_value(&reading).unwrap();
        assert_eq!(wire["role"], "cleanup");
        assert_eq!(wire["requestsRemaining"], 1996);
        assert_eq!(wire["readAt"], 42);
    }

    #[test]
    fn missing_or_unreadable_headers_leave_their_fields_absent() {
        let reading = Reading::from_headers(
            Role::Transcription,
            "whisper-large-v3-turbo",
            &headers(&[
                ("x-ratelimit-limit-requests", "2000"),
                ("x-ratelimit-remaining-requests", "many"),
                ("x-ratelimit-reset-requests", "soon"),
            ]),
            1,
        )
        .unwrap();
        assert_eq!(reading.requests_limit, Some(2000));
        assert_eq!(reading.requests_remaining, None);
        assert_eq!(reading.requests_reset, None);
        assert_eq!(reading.tokens_limit, None);
        let wire = serde_json::to_value(&reading).unwrap();
        assert!(wire.get("requestsRemaining").is_none());
        assert!(wire.get("tokensLimit").is_none());

        assert_eq!(
            Reading::from_headers(
                Role::Transcription,
                "m",
                &headers(&[("content-type", "application/json")]),
                1
            ),
            None
        );
    }

    #[test]
    fn the_store_keeps_the_latest_reading_per_model_and_marks_what_is_new() {
        let model = "test/the-store-model";
        let before = mark();
        assert_eq!(since(model, before), None);
        record(
            Role::Cleanup,
            model,
            &headers(&[("x-ratelimit-remaining-requests", "10")]),
        );
        let first = mark();
        assert_eq!(since(model, before).unwrap().requests_remaining, Some(10));
        assert_eq!(since(model, first), None);
        record(Role::Cleanup, model, &headers(&[]));
        assert_eq!(since(model, first), None, "no headers, no reading");
        record(
            Role::Cleanup,
            model,
            &headers(&[("x-ratelimit-remaining-requests", "9")]),
        );
        assert_eq!(since(model, first).unwrap().requests_remaining, Some(9));
        assert!(groq_usage()
            .models
            .iter()
            .any(|r| r.model == model && r.requests_remaining == Some(9)));
    }
}
