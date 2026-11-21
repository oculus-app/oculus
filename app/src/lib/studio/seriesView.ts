import type { VideoProgress } from "./progress";
import { madePartNeighbours, nextUnmadePart, type SeriesMembership } from "./series";
import type { SeriesPart, StudioSeries, VideoDetail } from "./videos";

/**
 * What the player page, the part-not-made page and the chat card decide
 * about a series' parts. Pure, so the decisions are tested without React;
 * the components only draw what these return.
 */

/** The part being made: the one asked for and not yet made, else, while
 *  the thread works, one whose folder exists without a render (the newest). */
export function partBeingMade(series: StudioSeries, requestedPart: number | null, running: boolean): number | null {
  if (requestedPart != null && series.parts.some((p) => p.number === requestedPart && !p.made)) return requestedPart;
  if (!running) return null;
  const started = series.parts.filter((p) => p.exists && !p.made);
  return newest(started)?.number ?? null;
}

/** The part a series thread's card is about: the one being made, else the
 *  one whose folder changed last, else the first. */
export function cardPartNumber(series: StudioSeries, making: number | null): number | null {
  if (making != null) return making;
  return newest(series.parts.filter((p) => p.video != null))?.number ?? series.parts[0]?.number ?? null;
}

function newest(parts: SeriesPart[]): SeriesPart | null {
  return parts.reduce<SeriesPart | null>((best, p) => {
    if (!best) return p;
    const a = p.video?.modified ?? -1;
    const b = best.video?.modified ?? -1;
    return a > b || (a === b && p.number < best.number) ? p : best;
  }, null);
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

/** Make this part shows only on the next part not made, and not while
 *  another part is being made. */
export function partRowKind(series: StudioSeries, part: SeriesPart, making: number | null): PartRowKind {
  if (part.made) return "made";
  if (making === part.number) return "making";
  if (making != null) return "none";
  return nextUnmadePart(series)?.number === part.number ? "make" : "none";
}

/** What a part not made offers on its own page: any part not made can be
 *  asked for there, unless another part is already being made. */
export type PartPageOffer = { kind: "make" } | { kind: "making" } | { kind: "busy"; reason: string };

export function partPageOffer(part: SeriesPart, making: number | null): PartPageOffer {
  if (making === part.number) return { kind: "making" };
  if (making != null) return { kind: "busy", reason: `Part ${making} is being made` };
  return { kind: "make" };
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

/** A part being made before its folder exists says where the request is;
 *  once the folder exists, its video's progress speaks. */
export function partStatus({
  part,
  making,
  sending,
  running,
  progress,
}: {
  part: SeriesPart;
  making: boolean;
  sending: boolean;
  running: boolean;
  progress: VideoProgress;
}): PartStatus {
  if (making && !part.exists) return { label: sending ? "Sending" : running ? "Starting" : "Asked for", tone: "busy" };
  return { label: progress.label, tone: progress.tone };
}

/** The card's status line for a series: "Part 1/5 ready", "Part 2/5 · Narrating". */
export function seriesStatusLabel(part: SeriesPart, total: number, status: PartStatus): string {
  const which = `Part ${part.number}/${total}`;
  return status.tone === "ok" ? `${which} ready` : `${which} · ${status.label}`;
}
