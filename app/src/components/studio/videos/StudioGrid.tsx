import { SeriesCells } from "@/components/studio/videos/series/SeriesCells";
import { VideoCard } from "@/components/studio/videos/VideoCard";
import { MediaGrid } from "@/components/ui/layout/MediaGrid";
import { useGridColumns } from "@/hooks/ui/useGridColumns";
import type { StudioGridItem } from "@/lib/studio/series";
import { gridRunEdges, type RunCellEdges } from "@/lib/ui/gridRun";

/** Where each item starts in the grid and, for an open folder, the outline of
 *  its run (the folder and its parts) at this column count. */
export function layoutGridItems(items: StudioGridItem[], open: ReadonlySet<string>, columns: number) {
  let index = 0;
  return items.map((item) => {
    const isOpen = item.kind === "series" && open.has(item.series.slug);
    const cells = isOpen && item.kind === "series" ? 1 + item.series.parts.length : 1;
    const edges: RunCellEdges[] | null = isOpen ? gridRunEdges(columns, index, cells) : null;
    index += cells;
    return { item, open: isOpen, edges };
  });
}

/** The Videos grid: single videos and series folders, newest first, an open
 *  folder's parts following it in place. */
export function StudioGrid({
  items,
  open,
  onToggle,
}: {
  items: StudioGridItem[];
  open: ReadonlySet<string>;
  onToggle: (slug: string) => void;
}) {
  const { ref, columns } = useGridColumns();
  return (
    <MediaGrid ref={ref}>
      {layoutGridItems(items, open, columns).map(({ item, open: isOpen, edges }) =>
        item.kind === "video" ? (
          <VideoCard key={`v:${item.video.slug}`} video={item.video} />
        ) : (
          <SeriesCells
            key={`s:${item.series.slug}`}
            series={item.series}
            open={isOpen}
            edges={edges}
            onToggle={() => onToggle(item.series.slug)}
          />
        ),
      )}
    </MediaGrid>
  );
}
