import { create } from "zustand";
import { finishDelete, undoDelete, type SentDelete } from "@/lib/drive/commands";

/**
 * The delete the Undo toast offers (`DeleteToast`). Rust holds the delete
 * itself, pending until the toast closes (`finishDelete`) or Undo is pressed
 * (`undoDelete`), by the handle it issued; this keeps that handle and what
 * went, so Recent and the note and drawing reconcilers can leave those
 * paths alone meanwhile. A newer delete replaces it: Rust has made the
 * older one final by then.
 */
interface PendingDeleteState {
  current: (SentDelete & { key: number }) | null;
  /** A delete just made: shown in the toast. */
  show: (sent: SentDelete) => void;
  /** The toast closed: the delete is final. */
  close: () => void;
  /** Undo: back out of the Trash; rejects with Rust's refusal. */
  undo: () => Promise<void>;
}

let shown = 0;

export const usePendingDeleteStore = create<PendingDeleteState>((set, get) => ({
  current: null,
  show: (sent) => {
    shown += 1;
    set({ current: { ...sent, key: shown } });
  },
  close: () => {
    const current = get().current;
    set({ current: null });
    if (current?.handle != null) {
      finishDelete(current.handle).catch((e) => console.warn(`[drive] finishing a delete: ${e}`));
    }
  },
  undo: async () => {
    const current = get().current;
    set({ current: null });
    if (current?.handle != null) await undoDelete(current.handle);
  },
}));

/** True when `rel` is one of `removed` or inside one. */
export function withinRemoved(rel: string, removed: readonly string[]): boolean {
  return removed.some((at) => rel === at || rel.startsWith(`${at}/`));
}

/** True while `rel` is, or is inside, an entry whose delete is pending. */
export function isPendingDelete(rel: string): boolean {
  return withinRemoved(rel, usePendingDeleteStore.getState().current?.removed ?? []);
}
