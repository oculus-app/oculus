use std::collections::HashSet;

use chrono::{DateTime, TimeDelta, Utc};
use serde::Deserialize;
use serde_json::Value;

use crate::harness::event::RateWindow;

#[derive(Deserialize)]
pub(super) struct Summary {
    #[serde(default)]
    groups: Vec<Group>,
    #[serde(default)]
    buckets: Vec<Bucket>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Group {
    display_name: Option<String>,
    #[serde(default)]
    buckets: Vec<Bucket>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Bucket {
    bucket_id: String,
    display_name: Option<String>,
    window: Option<String>,
    reset_time: Option<String>,
    description: Option<String>,
    remaining_fraction: Option<Value>,
    #[serde(default)]
    disabled: bool,
}

impl Summary {
    fn buckets(&self) -> Vec<(Option<&str>, &Bucket)> {
        if self.groups.iter().any(|group| !group.buckets.is_empty()) {
            self.groups
                .iter()
                .flat_map(|group| {
                    group
                        .buckets
                        .iter()
                        .map(|bucket| (group.display_name.as_deref(), bucket))
                })
                .collect()
        } else {
            self.buckets.iter().map(|bucket| (None, bucket)).collect()
        }
    }
}

impl Bucket {
    fn window(&self, group: Option<&str>, requested_at: DateTime<Utc>) -> Option<RateWindow> {
        let remaining = self.remaining_fraction.as_ref()?.as_f64()?;
        if self.disabled || !remaining.is_finite() {
            return None;
        }
        let id = self.bucket_id.as_str();
        let group = group.map(str::trim).filter(|name| !name.is_empty());
        let family = if id.starts_with("gemini-argon-") {
            group.unwrap_or("Gemini Argon")
        } else if id.starts_with("gemini-carbon-") {
            group.unwrap_or("Gemini Carbon")
        } else if id.starts_with("gemini-") {
            "Gemini"
        } else if id.starts_with("3p-") {
            "Claude & GPT"
        } else {
            group.unwrap_or(id)
        };
        let (label, duration) = match self.window.as_deref() {
            Some("5h") => ("5-hour", Some(5 * 60 * 60)),
            Some("weekly") => ("Weekly", Some(7 * 24 * 60 * 60)),
            _ => (
                self.display_name
                    .as_deref()
                    .map(str::trim)
                    .filter(|name| !name.is_empty())
                    .unwrap_or("Quota"),
                None,
            ),
        };
        let resets_at = self
            .reset_time
            .as_deref()
            .and_then(|time| DateTime::parse_from_rfc3339(time).ok())
            .filter(|reset| {
                // An untouched limit's rolling timestamp isn't a scheduled reset.
                !(remaining == 1.0
                    && self.description.is_none()
                    && duration.is_some_and(|secs| {
                        let offset =
                            reset.signed_duration_since(requested_at) - TimeDelta::seconds(secs);
                        offset.abs() <= TimeDelta::seconds(60)
                    }))
            })
            .map(|time| time.timestamp());
        Some(RateWindow {
            label: format!("{family} · {label}"),
            used_percent: (1.0 - remaining.clamp(0.0, 1.0)) * 100.0,
            resets_at,
        })
    }
}

/// Summaries arrive in host preference order, with each request's own clock.
pub(super) fn map_windows(
    summaries: impl IntoIterator<Item = (Summary, DateTime<Utc>)>,
) -> Vec<RateWindow> {
    let mut windows = Vec::new();
    let mut seen_buckets = HashSet::new();
    let mut labels = HashSet::new();
    for (summary, requested_at) in summaries {
        for (group, bucket) in summary.buckets() {
            let Some(mut window) = bucket.window(group, requested_at) else {
                continue;
            };
            if !seen_buckets.insert(bucket.bucket_id.clone()) {
                continue;
            }
            if !labels.insert(window.label.clone()) {
                let label = format!("{} ({})", window.label, bucket.bucket_id);
                window.label = label.clone();
                let mut suffix = 2;
                while !labels.insert(window.label.clone()) {
                    window.label = format!("{label} {suffix}");
                    suffix += 1;
                }
            }
            windows.push(window);
        }
    }
    windows
}
