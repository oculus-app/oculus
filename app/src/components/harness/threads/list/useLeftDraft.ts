import { useEffect } from "react";
import { leaveDraft, listsOpenDraft, useDraftStore } from "@/stores/chat/draftStore";

/** Cleanups waiting out their tick. */
const leaving = new Set<string>();

/**
 * Whether the list shows the draft of the composer this tab has open
 * (`listsOpenDraft`), and the leaving that feeds it: going elsewhere, or the
 * list unmounting, is what lists what the composer holds.
 */
export function useLeftDraft(key: string | null): boolean {
  useEffect(() => {
    if (key == null) return;
    leaving.delete(key);
    return () => {
      // Next tick, so StrictMode's unmount and remount is not a leave.
      leaving.add(key);
      queueMicrotask(() => {
        if (leaving.delete(key)) leaveDraft(key);
      });
    };
  }, [key]);
  return useDraftStore((s) => key != null && listsOpenDraft(s, key));
}
