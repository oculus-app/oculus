import { VideoCard } from "@/components/studio/videos/VideoCard";
import { Button } from "@/components/ui/button";
import { MediaRunCell } from "@/components/ui/layout/MediaRunCell";
import { useMakeSeriesPart, type MakeSeriesPartState } from "@/hooks/studio/useMakeSeriesPart";
import { seriesPartCells } from "@/lib/studio/seriesGrid";
import type { StudioSeries } from "@/lib/studio/videos";
import type { RunCellEdges } from "@/lib/ui/gridRun";
import { FolderCard } from "./FolderCard";
import { PartCard } from "./PartCard";

/** A series' grid cells: its folder card, and while open its parts after it,
 *  every cell inside one tinted run (`edges`, folder first). */
export function SeriesCells({
  series,
  open,
  edges,
  onToggle,
}: {
  series: StudioSeries;
  open: boolean;
  /** One per cell while open; null while closed. */
  edges: RunCellEdges[] | null;
  onToggle: () => void;
}) {
  return (
    <>
      <MediaRunCell edges={open ? (edges?.[0] ?? null) : null}>
        <FolderCard series={series} open={open} onToggle={onToggle} />
      </MediaRunCell>
      {open && edges && <OpenParts series={series} edges={edges.slice(1)} />}
    </>
  );
}

/** Mounted only while open, so a closed folder never reads its thread. */
function OpenParts({ series, edges }: { series: StudioSeries; edges: RunCellEdges[] }) {
  return <PartCells series={series} edges={edges} make={useMakeSeriesPart(series)} />;
}

/** An open folder's part cells, given the series' make state. */
export function PartCells({ series, edges, make }: { series: StudioSeries; edges: RunCellEdges[]; make: MakeSeriesPartState }) {
  return seriesPartCells(series, make).map((cell, i) => (
    <MediaRunCell key={cell.part.slug} edges={edges[i] ?? null}>
      {cell.kind === "made" ? (
        <VideoCard video={cell.video} part={cell.part.number} />
      ) : (
        <PartCard
          part={cell.part}
          state={cell.working ? "working" : "idle"}
          action={
            cell.offer ? (
              <span className="flex max-w-full flex-col items-center gap-1.5">
                <Button variant="outline" size="sm" disabled={make.sending} onClick={() => void make.make(series, cell.part.number)}>
                  Make this part
                </Button>
                {make.error && (
                  <span className="pointer-events-auto line-clamp-2 text-center text-[11.5px] leading-snug text-destructive" title={make.error}>
                    {make.error}
                  </span>
                )}
              </span>
            ) : undefined
          }
        />
      )}
    </MediaRunCell>
  ));
}
