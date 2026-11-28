import { useCallback, useEffect, useRef, useState } from "react";

import { lexiconList, type LexiconEntry } from "@/lib/studio/lexicon";
import { pronunciationHistory, pronunciations, type HistoryEvent, type Pronunciation } from "@/lib/studio/pronunciations";
import { usePendingPronunciations } from "@/stores/studio/pronunciationCountStore";
import { useVideosStore } from "@/stores/studio/videosStore";

/** One read's result: the rows, or the sentence it failed with. */
interface Read<T> {
  rows: T[] | null;
  error: string | null;
}

const NONE = { rows: null, error: null };

/** Reads with `read` into state; a slow read cannot overwrite a newer one. */
function useRead<T>(read: () => Promise<T[]>, label: string, onRows?: (rows: T[]) => void) {
  const [state, setState] = useState<Read<T>>(NONE);
  const seq = useRef(0);
  const after = useRef(onRows);
  after.current = onRows;
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const rows = await read();
      if (seq.current !== mine) return;
      setState({ rows, error: null });
      after.current?.(rows);
    } catch (cause) {
      console.error(`${label} read failed`, cause);
      if (seq.current === mine) setState((s) => ({ rows: s.rows, error: String(cause) }));
    }
  }, [read, label]);
  useEffect(() => () => void (seq.current += 1), []);
  return [state, load, setState] as const;
}

/**
 * The Pronunciation page's three reads: the review's suggestions, the saved
 * lexicons and the history. All three load on mount and again whenever the
 * window regains focus, since the CLI adds suggestions while the page is
 * open. A read of the suggestions also refreshes the nav's pending count.
 */
export function usePronunciationData(onItems: (items: Pronunciation[]) => void) {
  const [items, loadItems, setItems] = useRead(pronunciations, "Pronunciations", (rows) => {
    usePendingPronunciations.getState().setFrom(rows);
    if (rows.length > 0 && !useVideosStore.getState().loaded) void useVideosStore.getState().reload();
    onItems(rows);
  });
  const [lexicon, loadLexicon] = useRead<LexiconEntry>(lexiconList, "Lexicon");
  const [history, loadHistory] = useRead<HistoryEvent>(pronunciationHistory, "Pronunciation history");

  useEffect(() => {
    const all = () => {
      void loadItems();
      void loadLexicon();
      void loadHistory();
    };
    all();
    window.addEventListener("focus", all);
    return () => window.removeEventListener("focus", all);
  }, [loadItems, loadLexicon, loadHistory]);

  /** After a lexicon write: what it changed is in both of these. */
  const lexiconChanged = useCallback(() => {
    void loadLexicon();
    void loadHistory();
  }, [loadLexicon, loadHistory]);

  /** Puts a changed suggestion in its place, without a read. */
  const replaceItem = useCallback(
    (item: Pronunciation) =>
      setItems((s) => ({ ...s, rows: s.rows?.map((i) => (i.id === item.id ? item : i)) ?? s.rows })),
    [setItems],
  );

  return { items, lexicon, history, loadHistory, lexiconChanged, replaceItem };
}
