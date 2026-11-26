import { useMemo, useRef, useState, type ReactNode } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useFoldMotion } from "@/components/harness/timeline/useFoldMotion";
import { SIDE_NAV_FOLDS } from "@/components/ui/layout/SideNav";
import type { HarnessThread } from "@/lib/harness";
import { cn } from "@/lib/utils";
import { ROW_META } from "../rowType";
import { useRowPresence } from "./useRowPresence";

const FOLD = ["fold"];
const NONE: string[] = [];

/**
 * A parent's children under its row: a fold line saying how many, and when
 * open the children, indented on a guide line. The line joins with the first
 * child and leaves with the last, and a child joining or leaving an open
 * fold grows in or folds away (`row-presence`). The caret swaps between two
 * icons rather than rotating, so nothing on it transitions.
 */
export function ChildRows({
  parentTitle,
  kids,
  open,
  onToggle,
  row,
}: {
  parentTitle: string;
  /** Newest first, as the list draws them. */
  kids: HarnessThread[];
  open: boolean;
  onToggle: (open: boolean) => void;
  row: (thread: HarnessThread) => ReactNode;
}) {
  const idsKey = kids.map((k) => k.id).join(",");
  const ids = useMemo(() => (idsKey ? idsKey.split(",") : NONE), [idsKey]);
  const line = useRowPresence(ids.length ? FOLD : NONE);
  const rows = useRowPresence(ids);
  // A child that left is drawn as it last was while it folds away, and
  // forgotten once its exit has played.
  const seen = useRef(new Map<string, HarnessThread>());
  for (const k of kids) seen.current.set(String(k.id), k);
  const drawn = new Set(rows.map((r) => r.id));
  for (const id of seen.current.keys()) if (!drawn.has(id) && !ids.includes(id)) seen.current.delete(id);
  // The count stays on the last one through the line's own exit.
  const [count, setCount] = useState(kids.length);
  if (kids.length && kids.length !== count) setCount(kids.length);
  const noun = count === 1 ? "subagent" : "subagents";

  return line.map(({ id, gone, enter }) => (
    <div
      key={id}
      className="row-presence"
      data-state={gone == null ? "open" : "closed"}
      data-enter={enter || undefined}
      aria-hidden={gone != null || undefined}
    >
      {/* The clip pads nothing, or a closed line keeps its padding's height. */}
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${count} ${noun} of ${parentTitle}`}
          onClick={() => onToggle(!open)}
          className={cn(
            "flex h-6 w-full min-w-0 items-center gap-1 rounded-lg px-2.5 text-left outline-none transition-colors hover:bg-sidebar-item-hover hover:text-foreground focus-visible:bg-sidebar-item-hover",
            ROW_META,
            SIDE_NAV_FOLDS,
            "group-data-[collapsed=true]/nav:pointer-events-none",
          )}
        >
          {open ? <CaretDown size={11} className="shrink-0" /> : <CaretRight size={11} className="shrink-0" />}
          <span className="truncate">
            <span className="tabular-nums">{count}</span> {noun}
          </span>
        </button>
        <FoldBody open={open}>
          {rows.map((r) => {
            const t = seen.current.get(r.id);
            if (!t) return null;
            return (
              <div
                key={r.id}
                className="row-presence"
                data-state={r.gone == null ? "open" : "closed"}
                data-enter={r.enter || undefined}
                aria-hidden={r.gone != null || undefined}
              >
                <div>
                  <div className="pt-0.5">{row(t)}</div>
                </div>
              </div>
            );
          })}
        </FoldBody>
      </div>
    </div>
  ));
}

/** The open fold's body, easing open and shut as a Subject group does
 *  (`useFoldMotion`). It animates opacity and transform, so it keeps its
 *  layer from the start (`will-change`) and the icons inside never re-snap. */
function FoldBody({ open, children }: { open: boolean; children: ReactNode }) {
  const motion = useFoldMotion(open);
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    motion.animateNext(open);
  }
  if (!motion.mounted) return null;
  return (
    <div
      ref={motion.body}
      className="ml-[15px] flex flex-col border-l border-border-subtle pl-1 will-change-[opacity,transform]"
    >
      {children}
    </div>
  );
}
