import type { ReactNode } from "react";

import type { RunCellEdges } from "@/lib/ui/gridRun";
import { cn } from "@/lib/utils";

/**
 * A `MediaGrid` cell inside a tinted run (an open folder and its parts). The
 * tint reaches half a gap past each side, plus half a pixel so neighbours
 * overlap and no seam shows at a fractional zoom, so the run reads as one
 * shape; a dashed line marks the sides `edges` calls outer, and outer
 * corners round. It sits behind the tile and takes no layout of its own.
 * With no `edges` the cell is plain, so a folder keeps its element (and its
 * focus) as it opens and closes. `useGridMotion` finds the tint by
 * `data-run-tint`, and the cell keeps its own layer for the same glide.
 */
export function MediaRunCell({ edges, children }: { edges: RunCellEdges | null; children: ReactNode }) {
  return (
    <div className="relative z-0 flex min-w-0 flex-col will-change-transform">
      {edges && <span
        aria-hidden
        data-run-tint
        className={cn(
          "pointer-events-none absolute -z-10 border-dashed border-brand/55 bg-brand-muted",
          "inset-x-[calc(var(--media-gap-x)*-0.5_-_0.5px)] inset-y-[calc(var(--media-gap-y)*-0.5_-_0.5px)]",
          edges.top && "border-t",
          edges.right && "border-r",
          edges.bottom && "border-b",
          edges.left && "border-l",
          edges.topLeft && "rounded-tl-2xl",
          edges.topRight && "rounded-tr-2xl",
          edges.bottomRight && "rounded-br-2xl",
          edges.bottomLeft && "rounded-bl-2xl",
        )}
      />}
      {children}
    </div>
  );
}
