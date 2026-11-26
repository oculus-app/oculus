use std::collections::HashMap;
use std::sync::Mutex;

use sqlx::SqlitePool;
use tokio::sync::oneshot;

use super::report::{report, Report};

/// Who waits on which child, in memory only: after a restart nothing waits,
/// and a later [`wait_on`] reads what startup's repair left. The consumer
/// wakes a child's waiters when any run of it settles, its rows are
/// rewound, or it is deleted (`ConsumerIo::ended`); each reads the report
/// again.
#[derive(Default)]
pub struct Waiters(Mutex<HashMap<i64, Vec<oneshot::Sender<()>>>>);

impl Waiters {
    fn listen(&self, child: i64) -> oneshot::Receiver<()> {
        let (tx, rx) = oneshot::channel();
        let mut waiting = self.0.lock().unwrap();
        let on_child = waiting.entry(child).or_default();
        // A wait that has returned or was dropped leaves its wake behind.
        on_child.retain(|waiter| !waiter.is_closed());
        on_child.push(tx);
        rx
    }

    /// A wait that returned lets go of its wake: drop the closed ones, and
    /// the child's entry once none is left.
    fn forget(&self, child: i64) {
        let mut waiting = self.0.lock().unwrap();
        if let Some(on_child) = waiting.get_mut(&child) {
            on_child.retain(|waiter| !waiter.is_closed());
            if on_child.is_empty() {
                waiting.remove(&child);
            }
        }
    }

    /// Something of `child`'s ended: everyone waiting on it looks again.
    pub(in crate::harness) fn ended(&self, child: i64) {
        for waiter in self.0.lock().unwrap().remove(&child).unwrap_or_default() {
            let _ = waiter.send(());
        }
    }

    /// How many wakes are kept for `child`, closed ones included.
    #[cfg(test)]
    pub(in crate::harness) fn registered(&self, child: i64) -> usize {
        self.0.lock().unwrap().get(&child).map_or(0, Vec::len)
    }

    /// How many waits on `child` are still waiting.
    #[cfg(test)]
    pub(in crate::harness) fn waiting(&self, child: i64) -> usize {
        let waiting = self.0.lock().unwrap();
        let on_child = waiting.get(&child).map(Vec::as_slice).unwrap_or_default();
        on_child.iter().filter(|w| !w.is_closed()).count()
    }
}

/// Wait for `child`'s report. Each wake is registered before the rows are
/// read, so a settle that lands between the two is never missed: either the
/// read sees it, or the consumer wakes the registration after it.
pub(in crate::harness) async fn wait_on(
    pool: &SqlitePool,
    waiters: &Waiters,
    child: i64,
) -> Result<Report, String> {
    loop {
        let woken = waiters.listen(child);
        let read = report(pool, child).await;
        if !matches!(read, Ok(None)) {
            drop(woken);
            waiters.forget(child);
            return read.map(|report| report.expect("a report"));
        }
        woken
            .await
            .map_err(|_| "Oculus stopped waiting for the subagent.".to_string())?;
    }
}
