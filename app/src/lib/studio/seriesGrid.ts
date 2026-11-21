import { nextUnmadePart } from "./series";
import type { SeriesPart, StudioSeries, VideoRow } from "./videos";

/** How an open folder draws one part: a made part as its video's card; any
 *  other as an empty card that is being made, offers Make this part, or neither. */
export type PartCell =
  | { kind: "made"; part: SeriesPart; video: VideoRow }
  | { kind: "empty"; part: SeriesPart; working: boolean; offer: boolean };

/** A part is being made while it is the one asked for, or while its folder
 *  exists without a render and the series' thread runs. Make this part is
 *  offered on the next part not made, and only while nothing is being made. */
export function seriesPartCells(
  series: StudioSeries,
  make: { requestedPart: number | null; running: boolean },
): PartCell[] {
  const parts = [...series.parts].sort((a, b) => a.number - b.number);
  const working = (p: SeriesPart) => !p.made && (make.requestedPart === p.number || (p.exists && make.running));
  const busy = parts.some(working);
  const next = nextUnmadePart(series)?.number ?? null;
  return parts.map((part): PartCell =>
    part.made && part.video
      ? { kind: "made", part, video: part.video }
      : { kind: "empty", part, working: working(part), offer: !busy && part.number === next },
  );
}
