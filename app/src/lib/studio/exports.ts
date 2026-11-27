import type { ExportStatus, RenderPreset } from "@/lib/studio/render";
import type { RenderFile } from "@/lib/studio/videos";

// The export presets as the video page shows them: names, what each makes,
// and which renders the player can play.

/** The presets, every one an mp4 the player can show. */
export const VIDEO_PRESETS: readonly RenderPreset[] = ["draft", "final", "small"];

export const PRESET_LABEL: Record<RenderPreset, string> = {
  draft: "Draft",
  final: "Final",
  small: "Small",
};

/** What a preset makes, for `width` x `height` video. */
export function presetHint(preset: RenderPreset, width: number, height: number): string {
  const portrait = height > width;
  const sized = (short: number) => {
    const scale = Math.min(1, short / Math.min(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    return portrait ? `${w}×${h}` : `${h}p`;
  };
  switch (preset) {
    case "draft":
      return `mp4 · ${sized(540)}, quick`;
    case "final":
      return `mp4 · ${portrait ? `${width}×${height}` : `${height}p`}`;
    case "small":
      return `mp4 · ${sized(720)}, smaller file`;
  }
}

/** A row's state: `current` (its file matches the video), `stale` (a file
 *  from an older version), `none` (never made), or `blocked` (it cannot be
 *  made now; `problem` says why). */
export type ExportState = "current" | "stale" | "none" | "blocked";

export function exportState(status: ExportStatus): ExportState {
  if (status.current) return "current";
  if (status.problem) return "blocked";
  return status.path ? "stale" : "none";
}

/** A row's state in the Export menu: a Final or Small render that is not
 *  in Drive is still to make there, so it offers Render, which asks where. */
export function menuState(status: ExportStatus): ExportState {
  const state = exportState(status);
  return status.preset !== "draft" && !status.drive && state !== "blocked" ? "none" : state;
}

/** The name a first export of `preset` is offered under (`export::place`),
 *  for telling whether the student has renamed the file since. */
export function suggestedName(title: string, preset: RenderPreset): string {
  return `${preset === "small" ? `${title} (small)` : title}.mp4`;
}

/** The video renders the player can show, newest first. */
export function playableRenders(renders: RenderFile[]): RenderFile[] {
  return renders.filter((r) => VIDEO_PRESETS.includes(r.preset)).sort((a, b) => b.modified - a.modified);
}
