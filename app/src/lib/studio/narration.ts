import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Narrating a Studio video from its page (`app/src-tauri/src/studio/commands/`):
// what a narration would do now, which is local and free, and the narration
// itself, the one call here that synthesises (Kokoro, or the student's TTS
// server). One narration per folder; clips still current are kept, so a run
// after a failure or a cancel resumes.

/** Mirrors the command's status: which engine and voice would narrate, and
 *  how many clips a narration would make now. */
export interface NarrationStatus {
  engine: "kokoro" | "server" | null;
  voice: string | null;
  /** Scenes with narration. */
  scenes: number;
  /** Clips a narration would make now. */
  stale: number;
  /** Why narration cannot run now, a sentence fit to show. */
  problem: string | null;
}

export interface NarrateSummary {
  scenes: number;
  narrated: number;
  ms: number;
}

/** Reads what a narration would do; synthesises nothing. */
export function narrationStatus(slug: string): Promise<NarrationStatus> {
  return invoke<NarrationStatus>("studio_narration_status", { slug });
}

/** Narrates the stale clips. Null when cancelled; rejects with a sentence fit
 *  to show, also while a render or a narration of the folder runs. */
export function narrateVideo(slug: string): Promise<NarrateSummary | null> {
  return invoke<NarrateSummary | null>("studio_narrate", { slug });
}

/** false when the video has no narration running. */
export function cancelNarration(slug: string): Promise<boolean> {
  return invoke<boolean>("studio_narrate_cancel", { slug });
}

/** `dir` is the video's absolute folder, as `VideoRow.dir`. */
export type NarrateProgress = { dir: string } & (
  | { phase: "scene"; id: string; n: number; of: number }
  | { phase: "done"; id: string; n: number; of: number; outcome: "narrated" | "cached" }
  | { phase: "complete"; scenes: number; narrated: number }
  | { phase: "cancelled" }
  | { phase: "error"; error: string }
);

export const NARRATE_PROGRESS_EVENT = "studio-narrate-progress";

export function onNarrateProgress(handler: (progress: NarrateProgress) => void): Promise<UnlistenFn> {
  return listen<NarrateProgress>(NARRATE_PROGRESS_EVENT, (event) => handler(event.payload));
}
