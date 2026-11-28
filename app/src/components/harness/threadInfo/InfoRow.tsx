import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useClipMotion } from "@/hooks/ui/useClipMotion";
import { cn } from "@/lib/utils";

const ROW = "flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] leading-5";

/** A card row: glyph, label, then muted trailing facts (pages, a status).
 *  With `onOpen` it is a button that opens its thing, ⌘-click or a middle
 *  click in a new tab, as a file chip does. */
export function InfoRow({
  icon,
  label,
  trailing,
  title,
  onOpen,
  action,
}: {
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  title?: string;
  onOpen?: (newTab: boolean) => void;
  /** A control over the row's right end (Save to Drive…), a sibling of its
   *  button; the trailing facts give way to it while the row is hovered. */
  action?: ReactNode;
}) {
  const body = (
    <>
      <span className="flex size-[15px] shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing != null && trailing !== "" && (
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground tabular-nums",
            action != null && "group-hover/info:invisible group-focus-within/info:invisible",
          )}
        >
          {trailing}
        </span>
      )}
    </>
  );
  const row = !onOpen ? (
    <div data-info-row className={ROW} title={title}>
      {body}
    </div>
  ) : (
    <button
      type="button"
      data-info-row
      title={title}
      onClick={(e: MouseEvent) => onOpen(e.metaKey || e.ctrlKey)}
      onAuxClick={(e: MouseEvent) => {
        if (e.button !== 1) return;
        e.preventDefault();
        onOpen(true);
      }}
      className={cn(
        ROW,
        "cursor-pointer transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
        // The action sits over the row: hovering it keeps the row lit.
        action != null && "group-hover/info:bg-accent",
      )}
    >
      {body}
    </button>
  );
  if (action == null) return row;
  return (
    <div className="group/info relative">
      {row}
      <span className="absolute inset-y-0 right-1.5 flex items-center">{action}</span>
    </div>
  );
}

/** How many rows a group shows before "Show N more". */
const LIMIT = 5;

/** A headed group of rows that ends in "Show N more" past `LIMIT`; the card
 *  grows to hold them and never scrolls inside itself. `leading` draws rows
 *  above `rows`; when `rows` is empty, the group shows only if `leading`
 *  renders a `[data-info-row]`. */
export function InfoGroup<T>({
  heading,
  rows,
  render,
  leading,
}: {
  heading: string;
  rows: T[];
  render: (row: T) => ReactNode;
  leading?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const animateNext = useClipMotion(list, all);
  if (rows.length === 0 && !leading) return null;
  const hidden = rows.length - LIMIT;
  const shown = all || hidden <= 0 ? rows : rows.slice(0, LIMIT);
  return (
    <section
      aria-label={heading}
      className={cn(
        "flex-col border-t border-border-subtle py-1",
        rows.length === 0 ? "hidden has-[[data-info-row]]:flex" : "flex",
      )}
    >
      <h3 className="px-2.5 pt-1.5 pb-0.5 font-sans text-[11px] font-medium text-muted-foreground">{heading}</h3>
      {leading}
      <div ref={list} className="flex flex-col">
        {shown.map(render)}
      </div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => {
            animateNext();
            setAll((a) => !a);
          }}
          className="cursor-pointer rounded-lg px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {all ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
    </section>
  );
}
