import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Holds its children to the bottom of the page's own scroller, in the column
 * it sits in; it must be a direct child of the column that spans the page,
 * or it stops sticking once its parent scrolls past. Its top edge is a short
 * fade, so a row passing under it softens rather than being cut.
 */
export function StickyDock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("sticky bottom-0 z-10 pt-6", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-linear-to-t from-card to-card/0" />
      <div className="bg-card pb-4">{children}</div>
    </div>
  );
}
