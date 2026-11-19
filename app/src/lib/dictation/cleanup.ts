import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CleanupChoice } from "@/lib/lectures/transcribe/settings";
import type { AlignerProgress, AlignerState } from "@/lib/studio/aligner";

// Dictation cleanup's engines (`app/src-tauri/src/transcribe/cleanup/`):
// Groq's Qwen with the transcription key and S1-mini on this Mac, as the
// `transcribe` row's `cleanup` choice says. The status reads keyd or the
// keychain and the disk; none of these calls Groq.

/** Mirrors `S1Status`. */
export interface S1MiniStatus {
  /** "S1-mini" and "Superwhisper": the licence requires the name as written. */
  name: string;
  by: string;
  /** "S1-mini by Superwhisper": what every surface calls it. */
  label: string;
  status: AlignerState;
  /** The model with its licence and notice. */
  bytes: number;
  /** Why it cannot run here; absent when it can. */
  unavailable?: string;
  /** Its server is loaded right now. */
  running: boolean;
  englishOnly: boolean;
}

/** Mirrors `CleanupStatus`: `engine` is what a cleanup tries first under the
 *  chosen engine, `none` when that choice has nothing set up. */
export interface CleanupStatus {
  choice: CleanupChoice;
  engine: "groq" | "s1Mini" | "off" | "none";
  groq: { configured: boolean; model: string; error?: string };
  s1Mini: S1MiniStatus;
}

export function dictationCleanupStatus(): Promise<CleanupStatus> {
  return invoke<CleanupStatus>("dictation_cleanup_status");
}

/** Resolves once S1-mini is on disk; rejects `"cancelled"` on a cancel. */
export function downloadS1Mini(): Promise<void> {
  return invoke<void>("dictation_s1_download");
}

/** false when no download is running. */
export function cancelS1Mini(): Promise<boolean> {
  return invoke<boolean>("dictation_s1_cancel");
}

/** Stops its server and deletes it; resolves to the bytes freed. */
export function removeS1Mini(): Promise<number> {
  return invoke<number>("dictation_s1_remove");
}

/** The shared download event's payload, as the aligner's. */
export function onS1MiniProgress(handler: (progress: AlignerProgress) => void): Promise<UnlistenFn> {
  return listen<AlignerProgress>("dictation-s1-progress", (event) => handler(event.payload));
}
