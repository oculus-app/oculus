import { PartsOutline } from "@/components/studio/series/PartsOutline";
import { useMakeSeriesPart } from "@/hooks/studio/useMakeSeriesPart";
import type { SeriesMembership } from "@/lib/studio/series";

/**
 * The series' outline in a part's chat card. A made row plays that part in
 * the card's player, never beside; the lit row is the part playing, else
 * this chat's part. Make this part opens a new chat for that part, unsent.
 */
export function SeriesCardParts({
  inSeries,
  playing,
  onPlay,
}: {
  inSeries: SeriesMembership;
  /** The slug the card's player has open, if it is open. */
  playing: string | null;
  onPlay: (slug: string) => void;
}) {
  const { series, part } = inSeries;
  const { making, make } = useMakeSeriesPart(series);
  const played = playing == null ? null : (series.parts.find((p) => p.slug === playing) ?? null);
  return (
    <PartsOutline
      compact
      series={series}
      current={played?.number ?? part.number}
      currentLabel={played ? "Playing" : null}
      making={making}
      onMake={(n) => make(series, n)}
      action={(p) => (p.made && p.video ? { label: `Play part ${p.number}`, onClick: () => onPlay(p.slug) } : null)}
    />
  );
}
