import { useEffect, useRef, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { useRequestReveal } from "@/stores/chat/requestReveal";
import { cn } from "@/lib/utils";
import { RequestNotes } from "./SettledRow";

/**
 * A waiting request as one work-row line: a steady dot, what it waits for,
 * and its subject, opening to the whole of it; the composer's tray is where
 * it is answered. Notes that warn show without opening. "Show all in the
 * conversation" in the tray (`useRequestReveal`) opens it and scrolls to it.
 */
export function WaitingRow({
  requestId,
  tone,
  label,
  subject,
  code = false,
  notes,
  warn,
  children,
}: {
  requestId: number;
  /** `warning` for an approval, `brand` for a question. */
  tone: "warning" | "brand";
  label: string;
  subject: string;
  /** The subject is a command, drawn as code. */
  code?: boolean;
  notes: string[];
  warn: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const nonce = useRequestReveal((s) => (s.id === requestId ? s.nonce : 0));
  // A reveal from before this row mounted is not a reveal of it.
  const seen = useRef(nonce);
  useEffect(() => {
    if (nonce === seen.current) return;
    seen.current = nonce;
    setOpen(true);
    requestAnimationFrame(() => root.current?.scrollIntoView({ block: "nearest" }));
  }, [nonce]);

  return (
    <div ref={root} data-request={requestId} data-request-state="waiting" className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group/row flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-xs leading-5 transition-colors hover:text-foreground",
          open ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
          <span
            className={cn(
              "size-2 rounded-full ring-[3px]",
              tone === "warning" ? "bg-warning ring-warning/20" : "bg-brand ring-brand/20",
            )}
          />
        </span>
        <span className={cn("shrink-0", tone === "warning" ? "text-warning" : "text-brand")}>{label}</span>
        <span
          className={cn("min-w-0 truncate text-foreground/80", code ? "font-mono text-[11.5px]" : "font-medium")}
          title={subject}
        >
          {subject}
        </span>
        <CaretRight
          size={11}
          className={cn(
            "ml-auto shrink-0 transition-[opacity,transform] will-change-[opacity,transform] duration-150",
            open ? "rotate-90 opacity-60" : "opacity-0 group-hover/row:opacity-60",
          )}
        />
      </button>
      {(open || warn) && notes.length > 0 && (
        <div className="pl-[30px] pr-2">
          <RequestNotes notes={notes} warn={warn} />
        </div>
      )}
      {open && <div className="flex flex-col gap-1.5 pb-1 pl-[30px] pr-2 pt-0.5">{children}</div>}
    </div>
  );
}
