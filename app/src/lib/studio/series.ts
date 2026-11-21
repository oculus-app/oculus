import type { SeriesPart, StudioSeries, VideoList, VideoRow } from "./videos";

export type StudioGridItem =
  | { kind: "video"; video: VideoRow }
  | { kind: "series"; series: StudioSeries };

/** Only a loaded outline's matching video row claims a video from the grid. */
export function studioGridItems(list: VideoList, subject: string | null = null): StudioGridItem[] {
  const claimed = new Set(list.series.flatMap((s) => s.parts.flatMap((p) => p.video ? [p.video.slug] : [])));
  const items: StudioGridItem[] = [
    ...list.videos.filter((v) => !claimed.has(v.slug) && (subject == null || v.subject === subject))
      .map((video): StudioGridItem => ({ kind: "video", video })),
    ...list.series.filter((s) => subject == null || s.subject === subject)
      .map((series): StudioGridItem => ({ kind: "series", series })),
  ];
  const row = (item: StudioGridItem) => item.kind === "video" ? item.video : item.series;
  return items.sort((a, b) => (row(b).modified ?? -1) - (row(a).modified ?? -1)
    || row(a).slug.localeCompare(row(b).slug) || a.kind.localeCompare(b.kind));
}

export function studioSubjects(list: VideoList): string[] {
  return [...new Set([...list.videos, ...list.series].flatMap((r) => r.subject == null ? [] : [r.subject]))].sort();
}

export interface SeriesMembership {
  series: StudioSeries;
  part: SeriesPart;
}

/** Includes outline entries whose folder has not been created. */
export function seriesPartForSlug(list: VideoList, slug: string): SeriesMembership | null {
  // A real matching folder wins if another outline also reserved its slug.
  const matches = list.series.flatMap((s) => s.parts.filter((p) => p.slug === slug).map((part) => ({ series: s, part })));
  const claimed = matches.find((m) => m.part.video?.slug === slug);
  return claimed ?? (list.videos.some((v) => v.slug === slug) ? null : matches[0] ?? null);
}

export function madePartNeighbours(series: StudioSeries, partNumber: number): { previous: SeriesPart | null; next: SeriesPart | null } {
  const made = series.parts.filter((p) => p.made).sort((a, b) => a.number - b.number);
  return {
    previous: [...made].reverse().find((p) => p.number < partNumber) ?? null,
    next: made.find((p) => p.number > partNumber) ?? null,
  };
}

export function nextUnmadePart(series: StudioSeries): SeriesPart | null {
  return series.parts.filter((p) => !p.made).sort((a, b) => a.number - b.number)[0] ?? null;
}

export function madePartCount(series: StudioSeries): number {
  return series.parts.filter((p) => p.made).length;
}

export function seriesForThread(series: StudioSeries[], threadId: number | null): StudioSeries | null {
  return threadId == null ? null : series.find((s) => s.threadId === threadId) ?? null;
}
