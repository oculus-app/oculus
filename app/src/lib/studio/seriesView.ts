import type { VideoProgress } from "./progress";
import { madePartNeighbours, nextUnmadePart, type SeriesMembership } from "./series";
import type { SeriesPart, StudioSeries, VideoDetail } from "./videos";

/**
 * What the player page, the part-not-made page and the chat card decide
 * about a series' parts. Pure, so the decisions are tested without React;
 * the components only draw what these return.
 */

/** A part's chat: the one Make this part opened for it and that is making
 *  it (`seriesMakeStore`), else the one linked to its folder, else none. */
export function partThread(part: SeriesPart, remembered: number | null | undefined): number | null {
  return remembered ?? part.video?.threadId ?? null;
}

/** Each part's chat by part number; a part with none is absent. */
export function partThreads(series: StudioSeries, remembered: Readonly<Record<string, number>>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of series.parts) {
    const id = partThread(p, remembered[p.slug]);
    if (id != null) out[p.number] = id;
  }
  return out;
}

/** The parts being made, in order: not made, and their own chat's turn runs.
 *  Each part has its own chat, so several can be made at once. */
export function partsBeingMade(
  series: StudioSeries,
  threads: Readonly<Record<number, number>>,
  running: (threadId: number) => boolean,
): number[] {
  return series.parts
    .filter((p) => !p.made && threads[p.number] != null && running(threads[p.number]))
    .map((p) => p.number)
    .sort((a, b) => a - b);
}

export interface PartNav {
  previous: SeriesPart | null;
  next: SeriesPart | null;
  /** Why the off button is off, as its tooltip; null when there is nothing to say. */
  previousOff: string | null;
  nextOff: string | null;
}

/** Previous and Next skip parts not made; an off button names the part next to it. */
export function partNav(series: StudioSeries, number: number): PartNav {
  const { previous, next } = madePartNeighbours(series, number);
  const off = (n: number) => (series.parts.some((p) => p.number === n) ? `Part ${n} isn't made yet` : null);
  return {
    previous,
    next,
    previousOff: previous ? null : off(number - 1),
    nextOff: next ? null : off(number + 1),
  };
}

/** A row's end: its length, "Making…", the Make button, or nothing. */
export type PartRowKind = "made" | "making" | "make" | "none";

/** Make this part shows only on the next part not made, unless it is being made. */
export function partRowKind(series: StudioSeries, part: SeriesPart, making: readonly number[]): PartRowKind {
  if (part.made) return "made";
  if (making.includes(part.number)) return "making";
  return nextUnmadePart(series)?.number === part.number ? "make" : "none";
}

/** What a part not made offers on its own page: any part not made can be
 *  asked for there, whatever else is being made. */
export type PartPageOffer = "make" | "making";

export function partPageOffer(part: SeriesPart, making: readonly number[]): PartPageOffer {
  return making.includes(part.number) ? "making" : "make";
}

/** What the video page draws for its slug. A part not made has no folder
 *  (or one without a render) and is decided from the list, so nothing is
 *  called an error until the list has loaded. */
export type VideoPageView = "loading" | "error" | "player" | "unmade";

export function videoPageView({
  loaded,
  membership,
  detail,
  error,
}: {
  loaded: boolean;
  membership: SeriesMembership | null;
  detail: VideoDetail | null;
  error: string | null;
}): VideoPageView {
  if (membership && !membership.part.made) return "unmade";
  if (detail) return "player";
  if (error && loaded) return "error";
  return "loading";
}

export interface PartStatus {
  label: string;
  tone: VideoProgress["tone"];
}

/** A part being made before its folder exists says its chat has started;
 *  once the folder exists, its video's progress speaks. */
export function partStatus({
  part,
  making,
  progress,
}: {
  part: SeriesPart;
  making: boolean;
  progress: VideoProgress;
}): PartStatus {
  if (making && !part.exists) return { label: "Starting", tone: "busy" };
  return { label: progress.label, tone: progress.tone };
}

/** The card's status line for a series: "Part 1/5 ready", "Part 2/5 · Narrating". */
export function seriesStatusLabel(part: SeriesPart, total: number, status: PartStatus): string {
  const which = `Part ${part.number}/${total}`;
  return status.tone === "ok" ? `${which} ready` : `${which} · ${status.label}`;
}
