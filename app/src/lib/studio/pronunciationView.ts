import type { LexiconEntry } from "./lexicon";
import type { HistoryEvent, HistoryKind, Pronunciation } from "./pronunciations";

/** The page's library filter: every library, the global one, or a subject's
 *  course code. */
export type LibraryFilter = "all" | "global" | { code: string };

export function inLibrary(filter: LibraryFilter, subject: string | null): boolean {
  if (filter === "all") return true;
  if (filter === "global") return subject === null;
  return subject === filter.code;
}

/** Whether any of `fields` holds `query` (any case); a blank query matches. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

export const reviewMatches = (item: Pronunciation, query: string) =>
  matchesQuery(query, item.word, item.reading, item.sentence);

export const lexiconMatches = (entry: LexiconEntry, query: string) =>
  matchesQuery(query, entry.word, entry.reading, entry.phonemes);

export const historyMatches = (event: HistoryEvent, query: string) =>
  matchesQuery(query, event.word, event.reading, event.previous, event.note);

/** The course codes a filter can offer: every subject the data names, then
 *  the studio library list's, each once, sorted. */
export function libraryCodes(
  named: Iterable<string | null>,
  listed: Iterable<string>,
): string[] {
  const codes = new Set<string>();
  for (const c of named) if (c) codes.add(c);
  for (const c of listed) codes.add(c);
  return [...codes].sort();
}

export const KIND_LABEL: Record<HistoryKind, string> = {
  accepted: "Accepted",
  kept: "Kept guess",
  wrong: "Sent back",
  added: "Added",
  edited: "Edited",
  removed: "Removed",
  reverted: "Reverted",
};

const REVERTABLE_KINDS: ReadonlySet<HistoryKind> = new Set(["accepted", "kept", "added", "edited", "removed"]);

/** Whether Revert is offered on the event. */
export const canRevert = (event: HistoryEvent) => REVERTABLE_KINDS.has(event.kind) && !event.reverted;

/** Epoch ms of a stored UTC stamp (`YYYY-MM-DDTHH:MM:SS`, no zone mark). */
export function utcStampMs(stamp: string): number | undefined {
  const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : `${stamp}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

/** The tab the page opens on: Review while anything waits, else Lexicon. */
export function openingTab(items: readonly Pronunciation[]): "review" | "lexicon" {
  return items.some((i) => i.status === "pending") ? "review" : "lexicon";
}
