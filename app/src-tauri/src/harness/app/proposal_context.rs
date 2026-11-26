//! Fresh card context is read when a queued turn is dispatched, never when
//! queued. Which cards a prompt lists follows the session it goes to: a
//! decided card is left out only when that session was told its status.

use serde_json::{json, Value};
use sqlx::{Row, SqlitePool};

/// The most the cards section's list may take, in bytes of JSON: room for
/// one Subagent report at its 12,000-character cap and a few small cards,
/// beside a handoff's 16,000. Cards that do not fit come with a later send.
pub(in crate::harness) const CARDS_CAP: usize = 24_000;

pub(in crate::harness) struct Cards {
    pub section: String,
    versions: Vec<(i64, i64, String, String)>,
}

/// The session a prompt goes to: the binding its run goes out on, and
/// whether the send starts a session that has heard none of that
/// binding's runs (no native id to resume, and no live one kept).
#[derive(Clone, Copy, Debug)]
pub(in crate::harness) struct Audience {
    pub binding: Option<i64>,
    pub fresh: bool,
}

impl Audience {
    /// A session that has heard nothing.
    pub(in crate::harness) const NEW: Audience = Audience {
        binding: None,
        fresh: true,
    };
}

/// The thread's cards `audience` needs: every pending one, and each decided
/// one unless the run that told it its status went out on the same binding,
/// still exists, and is one that binding's session holds: covered, and not
/// followed by a full handoff, which only a session that has seen nothing
/// is given. `continuing` is the card a continuation is for: its prompt
/// points here for the outcome, so it is always listed. Newest first within
/// [`CARDS_CAP`]; the section says how many older ones wait.
pub(in crate::harness) async fn read(
    pool: &SqlitePool,
    thread: i64,
    continuing: Option<&str>,
    audience: Audience,
) -> Result<Cards, String> {
    let own = continuing
        .and_then(|id| id.split_once('.'))
        .and_then(|(item, block)| Some((item.parse::<i64>().ok()?, block.parse::<i64>().ok()?)))
        .unwrap_or((-1, -1));
    let rows = sqlx::query(
        "SELECT c.item_id, c.block, c.kind, c.status, c.state, c.initial_state
           FROM chat_proposals c
          WHERE c.thread_id = ?1
            AND ((c.item_id = ?2 AND c.block = ?3) OR c.status = 'pending'
                 OR c.told IS NULL OR c.told != c.status OR ?5 OR NOT EXISTS (
                   SELECT 1 FROM harness_runs r JOIN harness_bindings b ON b.id = r.binding_id
                    WHERE r.id = c.told_run_id AND b.id = ?4
                      AND r.ordinal > 0 AND r.ordinal <= b.covered_through
                      AND NOT EXISTS (
                        SELECT 1 FROM harness_handoffs h JOIN harness_runs n ON n.id = h.run_id
                         WHERE h.to_binding_id = b.id AND h.kind = 'full'
                           AND h.status IN ('pending', 'inline') AND n.ordinal > r.ordinal)))
          ORDER BY c.item_id DESC, c.block DESC",
    )
    .bind(thread)
    .bind(own.0)
    .bind(own.1)
    .bind(audience.binding.unwrap_or(-1))
    .bind(audience.fresh)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let mut listed = Vec::new();
    for row in rows {
        let item: i64 = row.get("item_id");
        let block: i64 = row.get("block");
        let card = card(pool, &row, item, block).await?;
        let bytes = serde_json::to_string(&card)
            .map_err(|e| e.to_string())?
            .len();
        let status: String = row.get("status");
        let state: String = row.get("state");
        listed.push((
            (item, block) == own,
            bytes,
            card,
            (item, block, status, state),
        ));
    }
    // The continued card is reserved; then newest first while they fit, and
    // at least one, so a card larger than the cap still goes out.
    let mut used: usize = listed.iter().filter(|c| c.0).map(|c| c.1 + 1).sum();
    let mut taken = listed.iter().any(|c| c.0);
    let mut omitted = 0;
    let mut kept = Vec::new();
    for (own, bytes, card, version) in listed {
        if own {
            kept.push((card, version));
        } else if omitted == 0 && (!taken || used + bytes < CARDS_CAP) {
            used += bytes + 1;
            taken = true;
            kept.push((card, version));
        } else {
            omitted += 1;
        }
    }
    kept.reverse();
    let (cards, versions): (Vec<Value>, Vec<_>) = kept.into_iter().unzip();
    let section = if cards.is_empty() {
        String::new()
    } else {
        let waiting = match omitted {
            0 => String::new(),
            1 => "\n\n1 older card is not listed here; it comes with a later message.".into(),
            n => {
                format!("\n\n{n} older cards are not listed here; they come with a later message.")
            }
        };
        format!("\n\n---\n\n## Cards in this thread (from Oculus, not typed by the student)\n\n{}{waiting}\n\nTo change a pending card, write a new card with its id as its amends argument.", serde_json::to_string(&cards).map_err(|e| e.to_string())?)
    };
    Ok(Cards { section, versions })
}

/// One card as the agent reads it: a pending card's whole state and
/// whether the student edited it, a decided one's job and what it made.
async fn card(
    pool: &SqlitePool,
    row: &sqlx::sqlite::SqliteRow,
    item: i64,
    block: i64,
) -> Result<Value, String> {
    let id = format!("{item}.{block}");
    let status: String = row.get("status");
    let state: String = row.get("state");
    let mut card = json!({"id": id, "kind": row.get::<String,_>("kind"), "status": status});
    let parsed: Value = serde_json::from_str(&state).map_err(|e| format!("card {id}: {e}"))?;
    if let Some(job) = parsed.get("job") {
        card["job"] = job.clone();
    }
    if status == "pending" {
        card["edited"] = json!(
            Some(&parsed)
                != serde_json::from_str::<Value>(&row.get::<String, _>("initial_state"))
                    .ok()
                    .as_ref()
        );
        card["card"] = parsed;
    } else {
        let made: Vec<Value> = crate::db::proposals::get(pool, &id)
            .await?
            .made
            .into_iter()
            .map(|made| {
                let id = if matches!(made.entity.as_str(), "project" | "task" | "tag") {
                    made.id
                        .parse::<i64>()
                        .map(Value::from)
                        .unwrap_or_else(|_| json!(made.id))
                } else {
                    json!(made.id)
                };
                json!({"entity":made.entity,"id":id,"title":made.title,"op":made.op})
            })
            .collect();
        card["made"] = json!(made);
    }
    Ok(card)
}

/// The provider accepted the send that listed `cards`: each is told its
/// status by `run_id`, unless an edit or Undo changed it meanwhile.
pub(in crate::harness) async fn accepted(
    pool: &SqlitePool,
    cards: Cards,
    run_id: i64,
) -> Result<(), String> {
    for (item, block, status, state) in cards.versions {
        sqlx::query("UPDATE chat_proposals SET told = ?3, told_run_id = ?5 WHERE item_id = ?1 AND block = ?2 AND status = ?3 AND state = ?4")
            .bind(item).bind(block).bind(status).bind(state).bind(run_id).execute(pool).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
