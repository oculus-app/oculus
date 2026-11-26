//! A rewind past a subagent's brief inside its own chat: the card's wait
//! reads "taken back past its brief" at once, and is over before any later
//! run of that chat settles, so nothing reports that run as the answer.

use std::time::Duration;

use crate::harness::app::children::{wait_on, Status};
use crate::harness::core::Kind;
use crate::harness::{store, Provider};

use super::commands::Bench;

#[test]
fn a_rewind_past_the_brief_wakes_the_cards_wait_before_any_later_run() {
    let mut bench = Bench::new("child-rewind");
    let child = bench.thread;
    bench.runtime.block_on(async {
        let parent = store::create_thread(&bench.pool, Provider::Codex, None, None, None, "p")
            .await
            .unwrap();
        sqlx::query("UPDATE harness_threads SET parent_thread_id = ?1 WHERE id = ?2")
            .bind(parent)
            .bind(child)
            .execute(&bench.pool)
            .await
            .unwrap();
    });
    bench.play(bench.turn("brief", "Read week 3", "anchor-1"));
    let brief = bench.count("SELECT MIN(id) FROM harness_items WHERE kind = 'user'");
    // The brief's run has not reported yet, while nothing holds the chat:
    // a rewind is allowed and the card still waits.
    bench
        .runtime
        .block_on(
            sqlx::query("UPDATE harness_runs SET execution_status = 'queued', queue_held = 0")
                .execute(&bench.pool),
        )
        .unwrap();
    let (pool, children) = (bench.pool.clone(), bench.children.clone());
    let wait = bench
        .runtime
        .spawn(async move { wait_on(&pool, &children, child).await });
    for _ in 0..200 {
        if bench.children.waiting(child) == 1 {
            break;
        }
        std::thread::sleep(Duration::from_millis(5));
    }
    assert_eq!(bench.children.waiting(child), 1, "the card waits");

    let (rewind, rewound) = bench.command("rewind", Kind::Rewind { item_id: brief });
    bench.play(vec![rewind]);
    bench.got(rewound).unwrap();
    let report = bench
        .runtime
        .block_on(async { tokio::time::timeout(Duration::from_secs(5), wait).await })
        .expect("the rewind woke the wait")
        .unwrap()
        .unwrap();
    assert_eq!(report.status, Status::Interrupted);
    assert_eq!(
        report.reason.as_deref(),
        Some("The subagent's chat was taken back past its brief.")
    );

    // The chat goes on; its next run is nobody's report.
    bench.play(bench.turn("later", "Something else", "anchor-2"));
    assert_eq!(bench.children.waiting(child), 0);
}
