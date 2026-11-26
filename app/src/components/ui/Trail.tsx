import { Fragment, useRef, type ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { useTrailGlide } from "@/hooks/ui/useTrailGlide";
import { cn } from "@/lib/utils";

export interface TrailCrumb {
  label: string;
  /** Drawn before the label; the caller sizes it to the line. */
  icon?: ReactNode;
  /** Makes the crumb a button. Leave it off the place the trail ends at. */
  onClick?: () => void;
}

/**
 * A path on one line that never wraps and never folds crumbs away. One that
 * doesn't fit is clipped with its last crumb in view and the cut edge faded;
 * hovering it, or tabbing to a crumb, glides it across (`useTrailGlide`), and
 * it scrolls sideways under the trackpad. `quiet` leaves the last crumb in
 * the line's own colour and weight; `data-current` marks it for a caller's
 * own style. The text size is the caller's, through `className`.
 */
export function Trail({ crumbs, quiet = false, label = "Path", className }: {
  crumbs: readonly TrailCrumb[];
  quiet?: boolean;
  /** Names the trail to a screen reader when its crumbs are buttons. */
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useScrollFade(ref, "x");
  useTrailGlide(ref);
  const stepped = crumbs.some((crumb) => crumb.onClick);
  const last = crumbs.length - 1;

  return (
    <span
      ref={ref}
      // On from the first frame, so the mask only ever moves its stops.
      data-scroll-fade="x"
      role={stepped ? "navigation" : undefined}
      aria-label={stepped ? label : undefined}
      className={cn(
        "relative flex min-w-0 overflow-x-auto overflow-y-hidden whitespace-nowrap text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Room for a crumb's focus ring, which the scroller would clip.
        stepped && "-m-[3px] p-[3px]",
        className,
      )}
    >
      {/* The end pad: a scroll offset is a whole pixel, and under page zoom
          the last crumb would otherwise end a fraction past the clip. */}
      <span className="flex w-max flex-none items-center gap-[0.45em] pr-px">
        {crumbs.map((crumb, index) => {
          const current = index === last;
          const look = cn(
            "flex flex-none items-center gap-[0.45em] [&>svg]:shrink-0",
            current && !quiet && "font-medium text-foreground",
          );
          const content = <>{crumb.icon}<span>{crumb.label}</span></>;
          return (
            <Fragment key={index}>
              {index > 0 && <CaretRight size={10} aria-hidden className="shrink-0 text-muted-foreground/50" />}
              {crumb.onClick ? (
                <button type="button" onClick={crumb.onClick} data-current={current || undefined}
                  className={cn(look, "cursor-pointer rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring")}>
                  {content}
                </button>
              ) : (
                <span data-current={current || undefined} aria-current={current && stepped ? "location" : undefined} className={look}>
                  {content}
                </span>
              )}
            </Fragment>
          );
        })}
      </span>
    </span>
  );
}
