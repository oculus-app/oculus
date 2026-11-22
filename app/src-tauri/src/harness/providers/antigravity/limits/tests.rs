use chrono::{DateTime, Utc};
use serde_json::json;

use super::credentials::{decode_keyring, Credentials};
use super::{hosts, map_windows, probe, Summary, DAILY, PROD};

const DAILY_FIXTURE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/fixtures/harness/antigravity-quota-daily.json"
));
const PROD_FIXTURE: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/fixtures/harness/antigravity-quota-prod.json"
));

fn time(iso: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(iso).unwrap().to_utc()
}

#[test]
fn maps_real_summaries_in_host_preference_order() {
    let daily = || {
        (
            serde_json::from_str(DAILY_FIXTURE).unwrap(),
            time("2026-11-22T08:01:24Z"),
        )
    };
    let prod = || {
        (
            serde_json::from_str(PROD_FIXTURE).unwrap(),
            time("2026-11-22T08:01:25Z"),
        )
    };
    let windows = map_windows([daily(), prod()]);
    let labels: Vec<_> = windows.iter().map(|window| window.label.as_str()).collect();
    assert_eq!(
        labels,
        [
            "Gemini · Weekly",
            "Gemini · 5-hour",
            "Claude & GPT · Weekly",
            "Claude & GPT · 5-hour",
            "Gemini 4 Argon · Weekly"
        ]
    );
    assert!((windows[0].used_percent - 18.65221).abs() < 1e-8);
    assert!((windows[1].used_percent - 5.66074).abs() < 1e-8);
    assert_eq!(
        windows[0].resets_at,
        Some(time("2026-11-28T11:16:19Z").timestamp())
    );
    assert_eq!(
        windows[1].resets_at,
        Some(time("2026-11-22T12:35:48Z").timestamp())
    );
    assert!(windows[2..]
        .iter()
        .all(|window| window.used_percent == 0.0 && window.resets_at.is_none()));
    assert!(map_windows([prod(), daily()])
        .iter()
        .all(|window| window.used_percent == 0.0 && window.resets_at.is_none()));
    assert_eq!(hosts(Some("consumer")), [DAILY, PROD]);
    assert_eq!(hosts(Some("oauth-personal")), [DAILY, PROD]);
    assert_eq!(hosts(Some("enterprise")), [PROD, DAILY]);
    assert_eq!(hosts(None), [PROD, DAILY]);
}

#[test]
fn merges_host_only_buckets_and_disambiguates_labels() {
    let primary: Summary = serde_json::from_value(json!({
        "groups": [{ "displayName": "Ignored", "buckets": [] }],
        "buckets": [
            { "bucketId": "gemini-a", "window": "5h", "remainingFraction": -0.1 },
            { "bucketId": "gemini-b", "window": "5h", "remainingFraction": 0.5 },
            { "bucketId": "disabled", "disabled": true, "remainingFraction": 0.3 },
            { "bucketId": "missing" },
            { "bucketId": "invalid", "remainingFraction": "unknown" }
        ]
    }))
    .unwrap();
    let secondary: Summary = serde_json::from_value(json!({
        "groups": [{ "buckets": [
            { "bucketId": "gemini-b", "window": "5h", "remainingFraction": 0 },
            { "bucketId": "gemini-carbon-1", "displayName": "Daily", "remainingFraction": 1.1 },
            { "bucketId": "gemini-argon-1", "window": "weekly", "remainingFraction": 0 },
            { "bucketId": "other", "displayName": "Daily", "remainingFraction": 0 }
        ] }],
        "buckets": [{ "bucketId": "ignored", "remainingFraction": 0 }]
    }))
    .unwrap();
    let requested_at = time("2026-11-22T08:01:24Z");
    let windows = map_windows([(primary, requested_at), (secondary, requested_at)]);
    let readings: Vec<_> = windows
        .iter()
        .map(|window| (window.label.as_str(), window.used_percent))
        .collect();
    assert_eq!(
        readings,
        [
            ("Gemini · 5-hour", 100.0),
            ("Gemini · 5-hour (gemini-b)", 50.0),
            ("Gemini Carbon · Daily", 0.0),
            ("Gemini Argon · Weekly", 100.0),
            ("other · Daily", 100.0)
        ]
    );
}

#[test]
fn untouched_rolling_resets_need_a_known_duration_and_no_description() {
    let summary = serde_json::from_value(json!({
        "groups": [{ "displayName": "Shared", "buckets": [
            {
                "bucketId": "untouched", "window": "5h", "remainingFraction": 1,
                "resetTime": "2026-11-22T13:02:24Z"
            },
            {
                "bucketId": "started", "window": "5h", "remainingFraction": 0.99,
                "resetTime": "2026-11-22T13:02:24Z"
            },
            {
                "bucketId": "described", "window": "5h", "remainingFraction": 1,
                "resetTime": "2026-11-22T13:02:24Z", "description": "Scheduled"
            },
            {
                "bucketId": "scheduled", "window": "5h", "remainingFraction": 1,
                "resetTime": "2026-11-22T13:02:24.001Z"
            },
            {
                "bucketId": "unknown-duration", "remainingFraction": 1,
                "resetTime": "2026-11-22T13:02:24Z"
            }
        ] }]
    }))
    .unwrap();
    let windows = map_windows([(summary, time("2026-11-22T08:01:24Z"))]);
    assert_eq!(windows.len(), 5);
    assert_eq!(windows[0].label, "Shared · 5-hour");
    assert_eq!(windows[0].resets_at, None);
    assert!(windows[1..]
        .iter()
        .all(|window| { window.resets_at == Some(time("2026-11-22T13:02:24Z").timestamp()) }));
}

#[test]
fn decodes_go_keyring_envelopes() {
    assert_eq!(decode_keyring(b" {}\n").as_deref(), Some(b"{}".as_slice()));
    assert_eq!(
        decode_keyring(b"go-keyring-base64:e30=\n").as_deref(),
        Some(b"{}".as_slice())
    );
    assert_eq!(
        decode_keyring(b"go-keyring-encoded:7B7d\n").as_deref(),
        Some(b"{}".as_slice())
    );
    assert!(decode_keyring(b"go-keyring-base64:???").is_none());
    assert!(decode_keyring(b"go-keyring-encoded:7").is_none());
    assert!(decode_keyring(b"go-keyring-encoded:+0").is_none());
}

#[test]
fn only_uses_a_token_with_more_than_a_minute_left() {
    let now = time("2026-11-22T08:00:00Z");
    let parse = |expiry: Option<&str>| {
        let data = json!({
            "token": { "access_token": "mock-access-token", "expiry": expiry },
            "auth_method": "consumer"
        });
        Credentials::parse(data.to_string().as_bytes(), now)
    };
    let fresh = parse(Some("2026-11-22T19:01:00.001+11:00")).unwrap();
    assert_eq!(fresh.auth_method.as_deref(), Some("consumer"));
    assert!(parse(Some("2026-11-22T19:01:00+11:00")).is_none());
    assert!(parse(Some("2026-11-22T18:59:59+11:00")).is_none());
    assert!(parse(None).is_none());
}

#[test]
#[ignore = "reads the local Antigravity account's quota"]
fn live_quota_probe() {
    let windows = probe();
    assert!(!windows.is_empty(), "no Antigravity quota windows returned");
    elog!("Antigravity quota windows: {windows:#?}");
}
