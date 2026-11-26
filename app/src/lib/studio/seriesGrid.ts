import { nextUnmadePart } from "./series";
import type { SeriesPart, StudioSeries, VideoRow } from "./videos";

/** How an open folder draws one part: a made part as its video's card; any
 *  other as an empty card that is being made, offers Make this part, or neither. */
export type PartCell =
  | { kind: "made"; part: SeriesPart; video: VideoRow }
  | { kind: "empty"; part: SeriesPart; working: boolean; offer: boolean };

/** `making` is the parts being made (`partsBeingMade`). Make this part is
 *  offered on the next part not made while that part is not being made. */
export function seriesPartCells(series: StudioSeries, making: readonly number[]): PartCell[] {
  const parts = [...series.parts].sort((a, b) => a.number - b.number);
  const next = nextUnmadePart(series)?.number ?? null;
  return parts.map((part): PartCell => {
    if (part.made && part.video) return { kind: "made", part, video: part.video };
    const working = !part.made && making.includes(part.number);
    return { kind: "empty", part, working, offer: !working && part.number === next };
  });
}
