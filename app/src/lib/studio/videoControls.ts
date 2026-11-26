import type { ExportState } from "@/lib/studio/exports";
import type { NarrationStatus } from "@/lib/studio/narration";

/**
 * What the video page decides about its theme and voice pickers and the
 * note beside the render on screen. Pure, so the
 * decisions are tested without React; the components only draw them.
 */

/** What is writing into the video's folder now. */
export interface FolderWork {
  rendering: boolean;
  narrating: boolean;
  /** The video's thread is running a turn. */
  running: boolean;
}

export const WAIT_FOR_RENDER = "Wait for the render or cancel it";
export const WAIT_FOR_NARRATION = "Wait for the narration or cancel it";
export const CHAT_AT_WORK = "The chat is still working on this video";

/** Why the theme and voice pills are off, as their tooltip; null when on.
 *  Both setters reject while a render or narration runs, and a turn may be
 *  rewriting video.json. */
export function pillBlocker({ rendering, narrating, running }: FolderWork): string | null {
  if (narrating) return WAIT_FOR_NARRATION;
  if (rendering) return WAIT_FOR_RENDER;
  if (running) return CHAT_AT_WORK;
  return null;
}

/** Why the note's Narrate button is off, as its tooltip; null when on. */
export function narrateBlocker({
  rendering,
  running,
  problem,
}: {
  rendering: boolean;
  running: boolean;
  /** `NarrationStatus.problem`, once read. */
  problem: string | null;
}): string | null {
  if (rendering) return WAIT_FOR_RENDER;
  if (running) return CHAT_AT_WORK;
  return problem;
}

export const sceneCount = (n: number) => (n === 1 ? "1 scene" : `${n} scenes`);

/** The note beside the render on screen: as made, its file out of date, the
 *  narration no longer covering the script or made in another voice (which
 *  a render needs first), or no narration yet. */
export type RenderNote = "plain" | "stale" | "narration" | "unnarrated";

export function renderNote({
  timingProblem,
  narration,
  narrated,
  running,
  state,
}: {
  timingProblem: string | null;
  /** What a narration would do now, once read. */
  narration: NarrationStatus | null;
  /** The video has been narrated before. */
  narrated: boolean;
  /** The video's thread is running a turn, which narrates a new video itself. */
  running: boolean;
  /** The shown preset's export state, once read. */
  state: ExportState | null;
}): RenderNote {
  const stale = (narration?.stale ?? 0) > 0;
  if (narrated && (timingProblem || stale)) return "narration";
  if (!narrated && stale && !running) return "unnarrated";
  return state === "stale" ? "stale" : "plain";
}

/** What the note's Narrate button would do, as its tooltip; null when the
 *  count is not known. A server is named, since the scenes leave the app. */
export function narrateHint(narration: NarrationStatus | null): string | null {
  if (!narration || narration.stale === 0) return null;
  const scenes = sceneCount(narration.stale);
  return narration.engine === "server" ? `Sends ${scenes} to your TTS server` : `Narrates ${scenes}`;
}

/** The note's words: which render and when it was made, quiet, and what is
 *  wrong with it, as a warning. `preset` is null when pills already name the
 *  render. */
export function renderNoteWords({
  note,
  preset,
  ago,
}: {
  note: RenderNote;
  preset: string | null;
  ago: string | null;
}): { made: string | null; flag: string | null } {
  if (note === "narration") return { made: null, flag: "Narration out of date" };
  if (note === "unnarrated") return { made: null, flag: "Not narrated" };
  const made = [preset, ago].filter(Boolean).join(" · ") || null;
  return { made, flag: note === "stale" ? "Out of date" : null };
}

/** The narration bar's words: which scene of how many, once known. */
export function narratingLabel({ n, of }: { n: number; of: number }): string {
  return of > 0 && n > 0 ? `Narrating ${n}/${of}` : "Narrating…";
}
