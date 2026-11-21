import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

/** A responsive grid of `MediaTile`s: as many 240px-or-wider columns as fit.
 *  Its gaps are `--media-gap-x` and `--media-gap-y`, which `MediaRunCell`
 *  reads to tint across them. */
export function MediaGrid({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-(--media-gap-x) gap-y-(--media-gap-y) [--media-gap-x:1rem] [--media-gap-y:1.5rem]"
    >
      {children}
    </div>
  );
}

/**
 * A 16:9 picture over a title and a line of facts. The tile is one button,
 * so a badge or bar on it is a plain element; the one control it may hold,
 * `action`, is drawn over the picture as the button's sibling, never inside it.
 */
export function MediaTile({
  picture,
  badge,
  corner,
  progress,
  action,
  title,
  meta,
  muted,
  frameClassName,
  expanded,
  href,
  onOpen,
}: {
  /** Fills the frame; the caller sizes its own image. */
  picture: ReactNode;
  /** Top right over the picture. */
  badge?: ReactNode;
  /** Bottom right over the picture: a video's length. */
  corner?: ReactNode;
  /** 0 to 1: a thin bar along the picture's foot. */
  progress?: number | null;
  /** Centred over the picture, outside the tile's button: a button of its
   *  own. Only buttons in it take the pointer; a press elsewhere opens the tile. */
  action?: ReactNode;
  title: string;
  meta?: ReactNode;
  /** The title in muted text, for something not made yet. */
  muted?: boolean;
  /** Restyles the frame: an empty slot's dashed edge, an open folder's. */
  frameClassName?: string;
  /** Set on a tile that opens and closes something in place. */
  expanded?: boolean;
  /** For ⌘-click to open the tile in a new tab (`newTabClicks`). */
  href?: string;
  onOpen: () => void;
}) {
  return (
    <div className="relative flex min-w-0 flex-col">
      <button
        type="button"
        data-tab-href={href}
        aria-expanded={expanded}
        onClick={onOpen}
        className="group flex min-w-0 cursor-pointer flex-col gap-2 text-left outline-none"
      >
        <span
          className={cn(
            "relative block aspect-video w-full overflow-hidden rounded-xl border border-border bg-secondary transition-[border-color,box-shadow] group-hover:border-foreground/25 group-focus-visible:ring-[3px] group-focus-visible:ring-ring/40",
            frameClassName,
          )}
        >
          {picture}
          {badge && <span className="absolute top-2 right-2 flex">{badge}</span>}
          {corner && <span className="absolute right-1.5 bottom-1.5 flex">{corner}</span>}
          {progress != null && (
            <span className="absolute inset-x-0 bottom-0 block h-1 bg-black/30">
              <span
                className="block h-full bg-brand transition-[width]"
                style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
              />
            </span>
          )}
        </span>
        <span className="min-w-0 space-y-0.5 px-0.5">
          <span className={cn("block truncate text-[13px]", muted ? "text-muted-foreground" : "font-medium text-foreground")}>
            {title}
          </span>
          {meta && <span className="block truncate text-[11.5px] text-muted-foreground">{meta}</span>}
        </span>
      </button>
      {action && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex aspect-video items-center justify-center p-3 [&_button]:pointer-events-auto">
          {action}
        </div>
      )}
    </div>
  );
}
