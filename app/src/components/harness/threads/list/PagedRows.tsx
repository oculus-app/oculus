import { useRef, type ReactNode } from "react";
import type { HarnessThread } from "@/lib/harness";
import { SIDE_NAV_FOLDS, SIDE_NAV_ROW, SIDE_NAV_ROW_IDLE } from "@/components/ui/layout/SideNav";
import { useClipMotion } from "@/hooks/ui/useClipMotion";
import { cn } from "@/lib/utils";
import { PAGE } from "../order";

/**
 * A subject group's first `limit` rows and its Show more, the list easing to
 * its new height as a page joins (`useClipMotion`). `more` says older threads
 * exist beyond those read, so Show more stays while the group shows all.
 */
export function PagedRows({
  items,
  limit,
  more,
  collapsed,
  onShowMore,
  row,
}: {
  items: HarnessThread[];
  limit: number;
  more: boolean;
  collapsed: boolean;
  onShowMore: () => void;
  row: (thread: HarnessThread) => ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const animateNext = useClipMotion(body, limit);
  const rest = items.length - limit;
  return (
    <div ref={body} className="flex flex-col gap-0.5">
      {items.slice(0, limit).map(row)}
      {(rest > 0 || more) && (
        <button
          type="button"
          tabIndex={collapsed ? -1 : undefined}
          onClick={() => {
            animateNext();
            onShowMore();
          }}
          className={cn(
            SIDE_NAV_ROW,
            SIDE_NAV_ROW_IDLE,
            SIDE_NAV_FOLDS,
            "px-2.5 text-[11.5px] group-data-[collapsed=true]/nav:pointer-events-none",
          )}
        >
          {/* One child: the row's flex gap would split the words. */}
          {rest > 0 ? (
            <span>
              Show <span className="tabular-nums">{Math.min(PAGE, rest)}</span> more
            </span>
          ) : (
            "Show more"
          )}
        </button>
      )}
    </div>
  );
}
