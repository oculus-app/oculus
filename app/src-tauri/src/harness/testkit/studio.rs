use serde_json::Value;
use super::{replay, scenario::Scenario};
use crate::harness::event::studio_command::is_studio_new;

/// Replay the captured shell envelopes, substituting only the command's
/// payload. Provider translation and persistence are the production paths.
#[test]
fn studio_creation_is_recognised_through_each_recorded_bridge() {
    fn replace(value: &mut Value) {
        match value {
            Value::Object(map) => {
                for (key, value) in map {
                    if matches!(key.as_str(), "command" | "CommandLine" | "Command") && value.is_string() {
                        *value = Value::String("oculus studio new minimax --theme chalk".into());
                    } else { replace(value); }
                }
            }
            Value::Array(values) => values.iter_mut().for_each(replace),
            _ => {}
        }
    }
    for name in ["claude-ls", "codex-ls", "opencode-v1-ls", "antigravity-acp-ls"] {
        let mut scenario = Scenario::recorded(name);
        scenario.frames.iter_mut().for_each(replace);
        let replay = replay::run(scenario);
        assert!(replay.items.iter().any(|item| {
            let meta = item["meta"].as_str().and_then(|s| serde_json::from_str::<Value>(s).ok()).unwrap_or_else(|| item["meta"].clone());
            meta["ok"] == true && is_studio_new(meta["name"].as_str().unwrap_or(""), &meta["input"])
        }), "{name}: {:?}", replay.items);
    }
}
