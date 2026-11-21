import { PartsOutline } from "@/components/studio/series/PartsOutline";
import { useMakeSeriesPart } from "@/hooks/studio/useMakeSeriesPart";
import type { ThreadSeries } from "@/hooks/studio/useThreadVideo";

/**
 * The series' outline in its thread's card. A made row plays that part in
 * the card's player, never beside; the lit row is the part playing, else the
 * part the card follows. Make this part sends "Make part N" to the thread.
 */
export function SeriesCardParts({
  inSeries,
  playing,
  onPlay,
}: {
  inSeries: ThreadSeries;
  /** The slug the card's player has open, if it is open. */
  playing: string | null;
  onPlay: (slug: string) => void;
}) {
  const { series, part, making } = inSeries;
  const { sending, error, make } = useMakeSeriesPart(series);
  const played = playing == null ? null : (series.parts.find((p) => p.slug === playing) ?? null);
  return (
    <PartsOutline
      compact
      series={series}
      current={played?.number ?? part.number}
      currentLabel={played ? "Playing" : null}
      making={making}
      sending={sending}
      error={error}
      onMake={(n) => void make(series, n)}
      action={(p) => (p.made && p.video ? { label: `Play part ${p.number}`, onClick: () => onPlay(p.slug) } : null)}
    />
  );
}
