import { useRef } from "react";
import { X } from "@phosphor-icons/react";
import { Dialog, DialogCanvas, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IconAction } from "@/components/markdown/embed/IconAction";
import { useWidgetFrame } from "./useWidgetFrame";
import { AskChoice, AskRunning } from "./ask/AskLine";
import type { AskControls } from "./ask/useWidgetAsk";

/** The expanded frame's width in CSS px, or the window's less its margins. */
const EXPANDED_WIDTH = 960;

/**
 * The widget in a dialog: a second frame laid out at `EXPANDED_WIDTH` (or
 * the window's width) and exactly its reported height, never scaled — the
 * card holds its size and its top edge while the content changes height,
 * and the dialog scrolls when it is taller than the window. Its state goes
 * through `onState` like the inline frame's; `onClose` gets the last of it.
 * A 3D scene in it draws for as long as it is open. Its requests share the
 * inline widget's `ask`, whose Allow and Stop move into the bar below, since
 * the dialog covers the card.
 */
export function WidgetExpand({
  doc,
  title,
  height,
  onState,
  ask,
  onClose,
}: {
  doc: string;
  title: string;
  /** The inline frame's height, until this frame reports its own. */
  height: number;
  onState: (state: Record<string, unknown>) => void;
  ask: AskControls;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // Always live while open: the inline frame is paused meanwhile.
  const report = useWidgetFrame(frame, doc, onState, height, true, ask.handle);
  const asks = ask.holding || ask.capped || ask.asking;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogCanvas>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">The widget, wider. Escape to close.</DialogDescription>
        <div className="min-h-0 flex-1 overflow-y-auto px-9 pt-9 pb-20">
          <div
            className="mx-auto overflow-hidden rounded-xl border border-border bg-card"
            style={{ maxWidth: EXPANDED_WIDTH }}
          >
            <iframe
              ref={frame}
              // Same sandbox as the inline frame: never `allow-same-origin`.
              sandbox="allow-scripts"
              srcDoc={doc}
              title={title}
              style={{ height: report.height ?? height }}
              className="block w-full border-0"
            />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6">
          <div className="pointer-events-auto flex min-w-0 items-center gap-0.5 rounded-full border border-border bg-card/90 p-1 pl-3 text-xs text-muted-foreground shadow-md backdrop-blur-sm">
            <span className="max-w-80 min-w-0 truncate">{title}</span>
            {asks && (
              <>
                <div className="mx-1 h-4 w-px shrink-0 bg-border" />
                <div className="flex min-w-0 items-center gap-1.5 text-foreground">
                  <AskChoice ask={ask} />
                  <AskRunning ask={ask} />
                </div>
              </>
            )}
            <div className="mx-1 h-4 w-px shrink-0 bg-border" />
            <IconAction label="Close" onClick={onClose} size="icon-sm">
              <X size={14} />
            </IconAction>
          </div>
        </div>
      </DialogCanvas>
    </Dialog>
  );
}
