import { useEffect, useRef } from "react";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Toast, ToastClose } from "@/components/ui/Toast";
import { isMac, isWindows } from "@/lib/platform";
import { usePendingDeleteStore, type PendingDelete } from "@/stores/drive/pendingDeleteStore";

/** What the platform calls it. */
const BIN = isWindows ? "Recycle Bin" : "Trash";

/** However long the pointer rests on it, the toast closes by then: well
 *  inside Rust's 60 s backstop (`delete::commands::UNATTENDED`), so Undo is
 *  never offered for a delete already final. */
export const MAX_LIFE_MS = 30_000;

/**
 * After a delete, from Drive, a download row or Studio's Export menu: "Moved
 * to Trash" with Undo (or ⌘Z where the delete was made) for the toast's six
 * seconds, paused while hovered, never past `MAX_LIFE_MS`. Its closing makes
 * the delete final; Undo puts it back, and a failed Undo says why here.
 * Rust's word that the delete is final takes Undo away. A delete with no way
 * back (Windows) has no Undo. Mounted once, in `AppLayout`.
 */
export function DeleteToast() {
  const current = usePendingDeleteStore((s) => s.current);
  const close = usePendingDeleteStore((s) => s.close);
  const undo = usePendingDeleteStore((s) => s.undo);
  // A newer delete starts a toast of its own, timer and all; a closing one
  // keeps its key and plays its exit.
  const last = useRef(current);
  if (current) last.current = current;
  const shown = last.current;

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => usePendingDeleteStore.getState().close(), MAX_LIFE_MS);
    return () => window.clearTimeout(timer);
  }, [current?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const undoable = !!current && current.handle != null && !current.final;
  useEffect(() => {
    if (!undoable) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isUndoKey(e) || !undoReaches(e.target)) return;
      e.preventDefault();
      void usePendingDeleteStore.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoable]);

  return (
    <Toast key={shown?.key} open={current != null} onClose={close} className="w-auto max-w-full rounded-2xl">
      {shown && <DeleteLine pending={shown} onUndo={() => void undo()} />}
    </Toast>
  );
}

/** ⌘Z (Ctrl+Z on Windows), not with Shift (redo). */
function isUndoKey(e: KeyboardEvent): boolean {
  return (isMac ? e.metaKey : e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z";
}

/** True where ⌘Z means this Undo: where a delete is made
 *  (`data-undo-delete`: Drive's browser, the downloads list, Studio's Export
 *  menu), the toast, or nothing focused; never in a field or an editor,
 *  whose own Undo it is. */
export function undoReaches(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .cm-editor")) return false;
  return target === document.body || target.closest("[data-undo-delete], [role='status']") != null;
}

/** The toast's body, apart from its timing, so it renders on its own. */
export function DeleteLine({ pending, onUndo }: { pending: PendingDelete; onUndo: () => void }) {
  const what = pending.count <= 1 ? `Moved to ${BIN}` : `${pending.count} items moved to ${BIN}`;
  const undoable = pending.handle != null && !pending.final;
  return (
    <div className="py-1.5 pr-1.5 pl-1.5 text-[13px]">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
          <Trash size={14} />
        </span>
        <span className="whitespace-nowrap text-foreground">{what}</span>
        {undoable && (
          <Button variant="ghost" size="xs" className="font-medium text-brand" disabled={pending.undoing} onClick={onUndo}>
            {pending.undoing ? "Undoing…" : "Undo"}
          </Button>
        )}
        <ToastClose label="Dismiss" />
      </div>
      {pending.error && (
        <p role="alert" className="max-w-[19rem] pt-1 pr-2 pb-0.5 pl-[2.375rem] text-[12px] leading-snug text-destructive">
          {pending.error}
        </p>
      )}
    </div>
  );
}
