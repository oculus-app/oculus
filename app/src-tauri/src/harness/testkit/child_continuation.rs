use super::{commands::Bench, continuation::seed_subagent_card};
use crate::harness::app::continuation::NOT_QUEUED;
use crate::harness::HarnessEvent;

#[test]
fn a_card_whose_continuation_cannot_be_queued_says_so_and_starts_nothing() {
    let mut bench = Bench::new("child-continuation-enqueue");
    let id = bench
        .runtime
        .block_on(seed_subagent_card(&bench.pool, bench.thread, None));
    bench.runtime.block_on(sqlx::query(
        "CREATE TRIGGER fail_enqueue BEFORE INSERT ON harness_runs WHEN NEW.origin = 'continuation'
         BEGIN SELECT RAISE(FAIL, 'injected enqueue failure'); END"
    ).execute(&bench.pool)).unwrap();
    // A card settles once: there is no second notification to retry on.
    bench.play(vec![bench.app(HarnessEvent::CardSettled {
        proposal: id.clone(),
    })]);
    assert!(bench.starts().is_empty());
    let skipped = serde_json::json!({"phase": "skipped", "reason": NOT_QUEUED});
    let stored: String = bench
        .runtime
        .block_on(
            sqlx::query_scalar("SELECT json_extract(state, '$.continuation') FROM chat_proposals")
                .fetch_one(&bench.pool),
        )
        .unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&stored).unwrap(),
        skipped
    );
    let events = bench.events();
    let snapshot = events
        .iter()
        .find(|e| e["event"]["type"] == "proposal")
        .expect("the card's views are told it did not continue");
    assert_eq!(
        snapshot["event"]["proposal"]["state"]["continuation"],
        skipped
    );
    assert_eq!(
        bench.count("SELECT COUNT(*) FROM harness_runs WHERE origin = 'continuation'"),
        0
    );
}
