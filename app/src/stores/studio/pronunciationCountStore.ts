import { useEffect } from "react";
import { create } from "zustand";

import { pronunciations, type Pronunciation } from "@/lib/studio/pronunciations";

interface PendingState {
  /** Suggestions waiting for a verdict; null before the first read. */
  pending: number | null;
  /** Reads the review again; a slow read cannot overwrite a newer one. */
  reload: () => Promise<void>;
  /** Takes the count from a list the caller already read. */
  setFrom: (items: readonly Pronunciation[]) => void;
}

export const countPending = (items: readonly Pronunciation[]) =>
  items.filter((i) => i.status === "pending").length;

export function createPendingStore(read: () => Promise<Pronunciation[]>) {
  let run = 0;
  return create<PendingState>((set) => ({
    pending: null,
    reload: async () => {
      const mine = ++run;
      try {
        const items = await read();
        if (mine === run) set({ pending: countPending(items) });
      } catch (cause) {
        // The nav's count is a hint; the page says the failure.
        console.error("Pronunciation count read failed", cause);
      }
    },
    setFrom: (items) => {
      run += 1;
      set({ pending: countPending(items) });
    },
  }));
}

/** The pending-review count Studio's nav shows beside Pronunciation. */
export const usePendingPronunciations = createPendingStore(pronunciations);

/** The count, read on mount and whenever the window regains focus, since
 *  the CLI adds suggestions while the app is open. */
export function usePendingCount(): number {
  const pending = usePendingPronunciations((s) => s.pending);
  useEffect(() => {
    const read = () => void usePendingPronunciations.getState().reload();
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  return pending ?? 0;
}
