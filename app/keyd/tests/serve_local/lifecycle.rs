use std::process::Command;
use std::time::{Duration, Instant};

use serde_json::json;

use crate::harness::{keyd_binary, Keyd};

#[test]
fn the_binary_serves_or_refuses_by_its_build() {
    let keyd = Keyd::start(60);
    let ping = keyd.call(json!({"op": "ping"}));
    if !cfg!(feature = "dev") {
        assert_eq!(ping["error"], "caller", "{ping}");
        return;
    }
    assert_eq!(ping["source_hash"].as_str().unwrap().len(), 64);
    let out = Command::new(keyd_binary())
        .arg("source-hash")
        .output()
        .unwrap();
    assert_eq!(
        String::from_utf8(out.stdout).unwrap().trim(),
        ping["source_hash"]
    );

    assert_eq!(
        keyd.call(json!({"op": "store", "secret": "voyage", "value": "pa-SECRET"}))["stored"],
        true
    );
    assert_eq!(
        keyd.call(json!({"op": "has", "secret": "voyage"}))["has"],
        true
    );
    let sealed = std::fs::read(keyd_core::paths::vault(&keyd.dir)).unwrap();
    assert!(
        !sealed.windows(9).any(|w| w == b"pa-SECRET"),
        "vault.bin is ciphertext"
    );
    assert_eq!(
        keyd.call(json!({"op": "delete", "secret": "voyage"}))["existed"],
        true
    );
}

#[test]
fn the_binary_exits_when_idle_and_never_logs_a_value() {
    let mut keyd = Keyd::start(1);
    keyd.call(json!({"op": "store", "secret": "groq", "value": "gsk-SECRET"}));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = keyd.child.try_wait().unwrap() {
            break status;
        }
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "keyd did not exit when idle"
        );
        std::thread::sleep(Duration::from_millis(50));
    };
    assert!(status.success());
    let mut log = String::new();
    std::io::Read::read_to_string(keyd.child.stderr.as_mut().unwrap(), &mut log).unwrap();
    assert!(log.contains("op=store"), "{log}");
    assert!(log.contains("idle for 1s, exiting"), "{log}");
    assert!(!log.contains("gsk-SECRET"));
}

/// A library not yet moved under the state folder keeps its vault at the
/// top: keyd refuses rather than start an empty one beside it, and reads the
/// same entries once the vault has moved.
#[test]
fn a_vault_still_at_the_top_is_refused_until_it_moves() {
    if !cfg!(feature = "dev") {
        return;
    }
    let mut keyd = Keyd::start(60);
    keyd.call(json!({"op": "store", "secret": "voyage", "value": "pa-SECRET"}));
    let moved = keyd_core::paths::vault(&keyd.dir);
    let unmoved = keyd_core::paths::unmoved_vault(&keyd.dir);
    std::fs::rename(&moved, &unmoved).unwrap();

    keyd.restart_as("cli");
    for request in [
        json!({"op": "has", "secret": "voyage"}),
        json!({"op": "store", "secret": "groq", "value": "gsk-SECRET"}),
    ] {
        let reply = keyd.call(request);
        assert_eq!(reply["error"], "vault", "{reply}");
        let detail = reply["detail"].as_str().unwrap();
        assert!(
            detail.contains("open Oculus to finish the update"),
            "{detail}"
        );
    }
    assert!(!moved.exists(), "no second vault was started");

    std::fs::rename(&unmoved, &moved).unwrap();
    assert_eq!(
        keyd.call(json!({"op": "has", "secret": "voyage"}))["has"],
        true
    );
    assert_eq!(
        keyd.call(json!({"op": "has", "secret": "groq"}))["has"],
        false
    );
}
