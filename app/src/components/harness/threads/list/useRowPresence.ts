import { useEffect, useState } from "react";

/** `row-presence`'s exit (`styles/utilities.css`). */
export const ROW_EXIT_MS = 200;

export interface PresentRow {
  id: string;
  /** When it left the list (ms), and is drawn closing until `ROW_EXIT_MS` on. */
  gone: number | null;
  /** Joined after the list first drew, so it grows in (`data-enter`). */
  enter: boolean;
}

/**
 * The rows to draw for `ids` (stable while equal, as `useShallow` gives):
 * each id in order, plus the ones that just left, kept where they stood until
 * their exit has played. Rows in the first draw don't animate in.
 */
export function useRowPresence(ids: string[]): PresentRow[] {
  const [rows, setRows] = useState<PresentRow[]>(() => ids.map((id) => ({ id, gone: null, enter: false })));
  const [seen, setSeen] = useState(ids);
  if (seen !== ids) {
    setSeen(ids);
    setRows(merge(rows, ids));
  }

  useEffect(() => {
    const gone = rows.flatMap((r) => (r.gone == null ? [] : [r.gone]));
    if (!gone.length) return;
    const wait = Math.max(0, Math.min(...gone) + ROW_EXIT_MS - Date.now());
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setRows((rs) => rs.filter((r) => r.gone == null || now - r.gone < ROW_EXIT_MS));
    }, wait);
    return () => window.clearTimeout(timer);
  }, [rows]);

  return rows;
}

/** `ids` as rows, with the rows that left slotted back at their old place. */
function merge(old: PresentRow[], ids: string[]): PresentRow[] {
  const live = new Set(ids);
  const before = new Map(old.map((r) => [r.id, r]));
  const out: PresentRow[] = ids.map((id) => {
    const r = before.get(id);
    return r && r.gone == null ? r : { id, gone: null, enter: true };
  });
  const now = Date.now();
  old.forEach((r, i) => {
    if (live.has(r.id)) return;
    out.splice(Math.min(i, out.length), 0, r.gone == null ? { ...r, gone: now } : r);
  });
  return out;
}
