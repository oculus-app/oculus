import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { driveErrorText, finishDelete, parseDriveError, undoDelete, type SentDelete } from "@/lib/drive/commands";

/**
 * The delete the Undo toast offers (`DeleteToast`). Rust holds the delete
 * itself, pending until the toast closes (`finishDelete`) or Undo is pressed
 * (`undoDelete`), by the handle it issued, and is the authority on whether it
 * still is: whatever makes it final (a newer delete, a move around it, the
 * 60 s backstop, a failed Undo of something gone from the Trash) sends
 * `FINAL_EVENT`, and the toast stops offering Undo. This keeps the handle and
 * what went, so Recent and the note and drawing reconcilers leave those paths
 * alone meanwhile, and a download row's entry hides until the delete is final.
 */

/** `delete::FINAL_EVENT` in Rust, with the delete's handle. */
export const FINAL_EVENT = "drive-delete-final";

export interface PendingDelete extends SentDelete {
  key: number;
  /** The downloads list's entry the delete came from, hidden meanwhile. */
  download?: number;
  /** Undo is under way. */
  undoing?: boolean;
  /** Rust says the delete is final: no Undo. */
  final?: boolean;
  /** Why the last Undo failed, said in the toast. */
  error?: string;
}

interface PendingDeleteState {
  current: PendingDelete | null;
  /** A delete just made: shown in the toast. `onFinal` runs once it is final. */
  show: (sent: SentDelete, from?: { download?: number; onFinal?: () => void }) => void;
  /** The toast closed: the delete is final. */
  close: () => void;
  /** Undo: back out of the Trash. A failure stays in the toast. */
  undo: () => Promise<void>;
  /** Rust made the delete `handle` final. */
  finalized: (handle: number) => void;
}

let shown = 0;
/** What to do once each delete still pending is final, by handle. */
const onFinals = new Map<number, () => void>();

function ranFinal(handle: number | null) {
  if (handle == null) return;
  const run = onFinals.get(handle);
  onFinals.delete(handle);
  run?.();
}

export const usePendingDeleteStore = create<PendingDeleteState>((set, get) => ({
  current: null,
  show: (sent, from) => {
    shown += 1;
    if (sent.handle == null) from?.onFinal?.();
    else if (from?.onFinal) onFinals.set(sent.handle, from.onFinal);
    set({ current: { ...sent, key: shown, download: from?.download, final: sent.handle == null } });
  },
  close: () => {
    const current = get().current;
    set({ current: null });
    if (current?.handle == null || current.final) return;
    finishDelete(current.handle)
      .then(() => ranFinal(current.handle))
      .catch((e) => console.warn(`[drive] finishing a delete: ${e}`));
  },
  undo: async () => {
    const current = get().current;
    if (current?.handle == null || current.final || current.undoing) return;
    const handle = current.handle;
    set({ current: { ...current, undoing: true, error: undefined } });
    try {
      await undoDelete(handle);
      onFinals.delete(handle);
      if (get().current?.handle === handle) set({ current: null });
    } catch (e) {
      // Still pending unless Rust says otherwise (`finalized`, or no such delete).
      const gone = parseDriveError(e).kind === "not_found" && !get().current?.final;
      const now = get().current;
      if (now?.handle !== handle) return;
      set({ current: { ...now, undoing: false, error: driveErrorText(e), final: now.final || gone } });
      if (gone) ranFinal(handle);
    }
  },
  finalized: (handle) => {
    ranFinal(handle);
    const current = get().current;
    if (current?.handle !== handle) return;
    // An Undo under way, or its failure on screen, keeps the toast to say so.
    if (current.undoing || current.error) set({ current: { ...current, final: true } });
    else set({ current: null });
  },
}));

/** True when `rel` is one of `removed` or inside one. */
export function withinRemoved(rel: string, removed: readonly string[]): boolean {
  return removed.some((at) => rel === at || rel.startsWith(`${at}/`));
}

/** True while `rel` is, or is inside, an entry whose delete is pending. */
export function isPendingDelete(rel: string): boolean {
  const current = usePendingDeleteStore.getState().current;
  return !current?.final && withinRemoved(rel, current?.removed ?? []);
}

/** Follow Rust's word that a delete is final; once, at the app's start. */
export function watchFinalDeletes(): () => void {
  let stop: (() => void) | null = null;
  let stopped = false;
  listen<number>(FINAL_EVENT, (e) => usePendingDeleteStore.getState().finalized(e.payload))
    .then((unlisten) => (stopped ? unlisten() : (stop = unlisten)))
    .catch(() => {});
  return () => {
    stopped = true;
    stop?.();
  };
}
