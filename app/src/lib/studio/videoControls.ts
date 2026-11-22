import type { ExportState } from "@/lib/studio/exports";
import type { NarrationStatus } from "@/lib/studio/narration";

/**
 * What the video page decides about its theme and voice pickers, the voice
 * popover's button and the note beside the render on screen. Pure, so the
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

/** The voice picked in the popover: null is the Settings voice. */
export type VoiceChoice = string | null;

/** The row the popover opens on: the Settings voice when the video narrates
 *  with it, else the video's own. */
export function initialVoiceChoice(status: NarrationStatus, settingsVoice: string | null): VoiceChoice {
  return status.voice == null || status.voice === settingsVoice ? null : status.voice;
}

/** The popover's one button: set the voice then narrate, only narrate, or
 *  nothing (the narration is current). */
export type NarrateAction =
  | { kind: "use"; voice: VoiceChoice; narrate: boolean; label: string }
  | { kind: "narrate"; label: string }
  | { kind: "current" };

export function narrateAction({
  choice,
  settingsVoice,
  status,
  name,
}: {
  choice: VoiceChoice;
  settingsVoice: string | null;
  status: NarrationStatus;
  /** How a voice id reads on the button (a Kokoro voice's name). */
  name: (id: string) => string;
}): NarrateAction {
  const picked = choice ?? settingsVoice;
  if (picked !== status.voice) {
    const who = picked ? name(picked) : "Default";
    // A voice change makes every clip stale.
    return status.scenes > 0
      ? { kind: "use", voice: choice, narrate: true, label: `Use ${who} · narrate ${sceneCount(status.scenes)}` }
      : { kind: "use", voice: choice, narrate: false, label: `Use ${who}` };
  }
  if (status.stale > 0) return { kind: "narrate", label: `Narrate ${sceneCount(status.stale)}` };
  return { kind: "current" };
}

/** The note beside the render on screen: as made, its file out of date, or
 *  the narration no longer covering the script (which a render needs first). */
export type RenderNote = "plain" | "stale" | "narration";

export function renderNote({
  timingProblem,
  state,
}: {
  timingProblem: string | null;
  /** The shown preset's export state, once read. */
  state: ExportState | null;
}): RenderNote {
  if (timingProblem) return "narration";
  return state === "stale" ? "stale" : "plain";
}

/** The note's words. `preset` is null when pills already name the render. */
export function renderNoteText({
  note,
  preset,
  ago,
}: {
  note: RenderNote;
  preset: string | null;
  ago: string | null;
}): string {
  if (note === "narration") return "Narration out of date";
  const made = [preset, ago].filter(Boolean).join(" · ");
  return note === "stale" ? `${made} · out of date` : made;
}

/** The narration bar's words: which scene of how many, once known. */
export function narratingLabel({ n, of }: { n: number; of: number }): string {
  return of > 0 && n > 0 ? `Narrating ${n}/${of}` : "Narrating…";
}
