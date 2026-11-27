import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { SentDelete } from "@/lib/drive/commands";

// Rendering a Studio video folder to one export preset's file with ffmpeg
// (`app/src-tauri/src/studio/commands/render.rs`), a Final or Small one then
// copied into Drive (`studio/export/`). One render per folder at a time;
// nothing here touches the network.

/** Mirrors `render::Preset`. */
export type RenderPreset = "draft" | "final" | "small";

/** Mirrors `SegmentReport`: one per scene, in video order. */
export interface SegmentReport {
  /** The scene, counting from 0. */
  scene: number;
  id: string | null;
  outcome: "cached" | "rendered";
  frames: number;
  /** Rendering and encoding it; 0 when cached. */
  ms: number;
  /** Frames a second while rendering it; null when cached. */
  fps: number | null;
}

/** Mirrors `render::Report`. */
export interface RenderReport {
  /** The file written: the mp4. */
  path: string;
  preset: RenderPreset;
  width: number | null;
  height: number | null;
  fps: number;
  frames: number;
  /** Seconds. */
  duration: number;
  /** Whether it has a narration track. */
  audio: boolean;
  threads: number;
  segments: SegmentReport[];
  /** Written beside `path`: the video's `.vtt` captions. */
  sidecars: string[];
  /** Cache files deleted afterwards. */
  pruned: string[];
  ms: number;
}

/** A Final or Small render's Drive file, by its `files` row. */
export interface DriveFile {
  fileId: number;
  /** Data-dir-relative. */
  rel: string;
}

/** Where a first Final or Small render goes: a Drive folder (data-dir-relative,
 *  `""` is the top level) and the file's name. */
export interface DriveDestination {
  targetDir: string;
  name: string;
}

/** Mirrors `Exported`: what putting a render into Drive did. */
export interface DriveExport {
  file: DriveFile;
  /** Absolute. */
  path: string;
  /** The `.vtt` beside it, data-dir-relative, when the video is narrated. */
  captions: string | null;
  /** The linked file was replaced where it is now. */
  replaced: boolean;
}

/** Renders `dir` to `<dir>/renders/<preset>.<ext>`; a Final or Small render
 *  then goes into Drive: to `destination` when given, else over its linked
 *  file. Resolves to the report, or null when cancelled; rejects with a
 *  sentence fit to show when the render or its copy fails or `dir` already
 *  has one running. */
export function renderVideo(
  dir: string,
  preset: RenderPreset,
  destination?: DriveDestination,
): Promise<(RenderReport & { drive: DriveExport | null }) | null> {
  return invoke("studio_render", { dir, preset, destination: destination ?? null });
}

/** Where a first Final or Small render of `slug` is suggested to go:
 *  `Videos` in its subject, or at the top level, named after its title. */
export function exportSuggestion(slug: string, preset: RenderPreset): Promise<DriveDestination> {
  return invoke<DriveDestination>("studio_export_suggestion", { slug, preset });
}

/** Mirrors `render::ExportStatus`: one preset's file and whether a render now
 *  would make the same file. */
export interface ExportStatus {
  preset: RenderPreset;
  /** Absolute path of `renders/<preset>.<ext>`, when it exists. */
  path: string | null;
  /** Seconds since the epoch. */
  modified: number | null;
  current: boolean;
  /** Why the preset cannot render now, a sentence fit to show. */
  problem: string | null;
  /** The Drive file a Final or Small render went to; null for a Draft and
   *  until the first export, or once that file is gone from Drive. */
  drive: DriveFile | null;
}

/** Every preset's status, in the menu's order. Renders nothing. */
export function exportStatus(dir: string): Promise<ExportStatus[]> {
  return invoke<ExportStatus[]>("studio_exports", { dir });
}

/** Moves `renders/<preset>.mp4` and its `.vtt` to the Trash (the Recycle Bin
 *  on Windows), and a Final or Small's Drive copy, while it is still this
 *  export, as Drive deletes it: the delete the Undo toast offers, or null.
 *  Rejects with a sentence fit to show while a render runs or when there is
 *  no such render. */
export function deleteRender(slug: string, preset: RenderPreset): Promise<SentDelete | null> {
  return invoke<SentDelete | null>("studio_render_delete", { slug, preset });
}

/** false when `dir` has no render running. */
export function cancelRender(dir: string): Promise<boolean> {
  return invoke<boolean>("studio_render_cancel", { dir });
}

/** Mirrors `Plan`. */
export interface RenderPlan {
  segments: number;
  cached: number;
  /** Frames to render: the segments not cached. */
  frames: number;
  threads: number;
}

/** Mirrors `Event`; `dir` is the folder as `renderVideo` was given it.
 *  `rendering` comes at most about ten times a second, plus each segment's
 *  first and last frame. */
export type RenderProgress = { dir: string; preset: RenderPreset } & (
  | { phase: "planning"; plan?: RenderPlan }
  | {
      phase: "rendering";
      /** 1-based, of `of` segments. */
      segment: number;
      of: number;
      scene: number;
      /** 1-based, of this segment's `frames`. */
      frame: number;
      frames: number;
      fps: number;
    }
  | { phase: "muxing" }
  /** A Final or Small render being copied into Drive. */
  | { phase: "exporting" }
  | { phase: "complete"; path: string; report: RenderReport; drive?: DriveExport }
  | { phase: "cancelled" }
  | { phase: "error"; error: string }
);

export function onRenderProgress(handler: (progress: RenderProgress) => void): Promise<UnlistenFn> {
  return listen<RenderProgress>("studio-render-progress", (event) => handler(event.payload));
}
