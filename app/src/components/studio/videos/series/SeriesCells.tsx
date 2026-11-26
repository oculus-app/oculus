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

/** Mounted only while open, so a closed folder never reads its parts' chats. */
function OpenParts({ series, edges }: { series: StudioSeries; edges: RunCellEdges[] }) {
  return <PartCells series={series} edges={edges} make={useMakeSeriesPart(series)} />;
}

/** An open folder's part cells, given the series' parts being made. */
export function PartCells({
  series,
  edges,
  make,
}: {
  series: StudioSeries;
  edges: RunCellEdges[];
  make: Pick<MakeSeriesPartState, "making" | "make">;
}) {
  return seriesPartCells(series, make.making).map((cell, i) => (
    <MediaRunCell key={cell.part.slug} edges={edges[i] ?? null}>
      {cell.kind === "made" ? (
        <VideoCard video={cell.video} part={cell.part.number} />
      ) : (
        <PartCard
          part={cell.part}
          state={cell.working ? "working" : "idle"}
          action={
            cell.offer ? (
              <Button variant="outline" size="sm" onClick={() => make.make(series, cell.part.number)}>
                Make this part
              </Button>
            ) : undefined
          }
        />
      )}
    </MediaRunCell>
  ));
}
