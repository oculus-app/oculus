import type { SeriesPart, StudioSeries, VideoRow } from "@/lib/studio/videos";

export const video = (slug: string, extra: Partial<VideoRow> = {}): VideoRow => ({
  slug, dir: `/videos/${slug}`, title: slug, subject: null, scenes: 1, series: null, part: null,
  narrated: false, renders: [], modified: null, problem: null, threadId: null, seconds: null, ...extra,
});
export const part = (number: number, extra: Partial<SeriesPart> = {}): SeriesPart => ({
  number, slug: `part-${number}`, title: `Part ${number}`, question: "Why?", exists: false, made: false, video: null, ...extra,
});
export const series = (extra: Partial<StudioSeries> = {}): StudioSeries => ({
  slug: "motion", title: "Motion", subject: "PHYS", theme: "default", parts: [], modified: null, ...extra,
});

