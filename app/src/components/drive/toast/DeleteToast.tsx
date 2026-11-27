import { useRef } from "react";
import { Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Toast, ToastClose } from "@/components/ui/Toast";
import { reportDriveProblem } from "@/lib/drive/actions";
import { driveErrorText } from "@/lib/drive/commands";
import { isWindows } from "@/lib/platform";
import { usePendingDeleteStore } from "@/stores/drive/pendingDeleteStore";

/** What the platform calls it. */
const BIN = isWindows ? "Recycle Bin" : "Trash";

/**
 * After a delete, from Drive, a download row or Studio's Export menu: "Moved
 * to Trash" with Undo, for the toast's six seconds. Its closing, whichever
 * way, makes the delete final; Undo puts it back. A delete with no way back
 * (Windows) says so with no Undo. Mounted once, in `AppLayout`.
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
  return (
    <Toast key={shown?.key} open={current != null} onClose={close} className="w-auto max-w-full rounded-full">
      <DeleteLine
        count={shown?.removed.length ?? 0}
        undoable={shown?.handle != null}
        onUndo={() => void undo().catch((e) => reportDriveProblem(driveErrorText(e)))}
      />
    </Toast>
  );
}

/** The toast's body, apart from its timing, so it renders on its own. */
export function DeleteLine({ count, undoable, onUndo }: { count: number; undoable: boolean; onUndo: () => void }) {
  const what = count === 1 ? `Moved to ${BIN}` : `${count} items moved to ${BIN}`;
  return (
    <div className="flex items-center gap-2.5 py-1.5 pr-1.5 pl-1.5 text-[13px]">
      <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground">
        <Trash size={14} />
      </span>
      <span className="whitespace-nowrap text-foreground">{what}</span>
      {undoable && (
        <Button variant="ghost" size="xs" className="font-medium text-brand" onClick={onUndo}>
          Undo
        </Button>
      )}
      <ToastClose label="Dismiss" />
    </div>
  );
}
