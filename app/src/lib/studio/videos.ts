import { invoke } from "@tauri-apps/api/core";

import type { RenderPreset } from "@/lib/studio/render";

// Studio's videos under `<data>/studio/videos/<slug>/`
// (`app/src-tauri/src/studio/commands/videos/`). A slug is `[a-z0-9-]+`.

/** Mirrors the app command's `VideoView`. */
export interface VideoRow {
  slug: string;
  /** Absolute folder. */
  dir: string;
  /** What the video is called: video.json's `title`, else its title card's,
   *  else the slug spelled out (`videos::video_title`). */
  title: string;
  subject: string | null;
  /** null when video.json does not load; `problem` says why. */
  scenes: number | null;
  series: string | null;
  /** Current 1-based position in the series outline. */
  part: number | null;
  /** A narration manifest exists; it may be stale. */
  narrated: boolean;
  /** File names in `renders/`: `draft.mp4`, `final.mp4`, … */
  renders: string[];
  /** Seconds since the epoch. */
  modified: number | null;
  problem: string | null;
  /** The harness thread that made it, if any. */
  threadId: number | null;
  /** Length once every scene has valid timing, including silent holds. */
  seconds: number | null;
}

export interface SeriesPart {
  slug: string;
  title: string;
  question: string;
  number: number;
  exists: boolean;
  made: boolean;
  /** Populated when the folder exists and its video names this series. */
  video: VideoRow | null;
}

export interface StudioSeries {
  slug: string;
  title: string;
  subject: string | null;
  theme: string;
  parts: SeriesPart[];
  /** First linked thread in outline order, skipping deleted threads. */
  threadId: number | null;
  /** Newest outline or matching part modification, in epoch seconds. */
  modified: number | null;
}

export interface VideoList {
  videos: VideoRow[];
  series: StudioSeries[];
}

export function listVideosAndSeries(subject?: string | null): Promise<VideoList> {
  return invoke<VideoList>("studio_videos", { subject: subject ?? null });
}

/** Videos newest first; `subject` is a course code. */
export function listVideos(subject?: string | null): Promise<VideoRow[]> {
  return listVideosAndSeries(subject).then((list) => list.videos);
}

/** One scene of a video, in order. Times are seconds and null until the
 *  whole video has valid timing (holds or current narration). */
export interface SceneInfo {
  id: string | null;
  component: string;
  /** The scene's `title` prop, when it has one. */
  title: string | null;
  /** Its component resolves (the video's own, the subject's or the global
   *  library's); false while the agent has yet to write it. */
  built: boolean;
  start: number | null;
  duration: number | null;
  /** The scene's narration, from `script.md`'s `## id` section. */
  text: string | null;
}

/** One export preset's file. */
export interface RenderFile {
  preset: RenderPreset;
  /** Absolute path. */
  path: string;
  /** Seconds since the epoch. */
  modified: number;
  /** A video render's captions are beside it as `<preset>.vtt`. */
  captions: boolean;
}

export interface VideoDetail {
  row: VideoRow;
  fps: number;
  width: number;
  height: number;
  theme: string;
  /** The narration voice id, from video.json or Settings -> Studio -> Narration; null if
   *  neither names one. */
  voice: string | null;
  /** video.json's `captions`: the renders have captions drawn into the picture. */
  captions: boolean;
  /** Why the narration no longer gives every scene a length (the script
   *  changed after narrating); null when it does, or there is none. */
  timingProblem: string | null;
  /** When `script.md` and the narration manifest were last written, in
   *  seconds since the epoch; null while there is none. */
  scriptModified: number | null;
  narrationModified: number | null;
  scenes: SceneInfo[];
  renders: RenderFile[];
}

/** The video's length in seconds, once every scene has one. */
export function videoSeconds(detail: VideoDetail): number | null {
  const last = detail.scenes[detail.scenes.length - 1];
  return last?.start != null && last.duration != null ? last.start + last.duration : null;
}

export function videoDetail(slug: string): Promise<VideoDetail> {
  return invoke<VideoDetail>("studio_video_detail", { slug });
}

/** Moves the video's whole folder to the Trash (the Recycle Bin on Windows)
 *  and drops its thread link. Rejects with a sentence fit to show, for
 *  instance while a render of it runs. */
export function deleteVideo(slug: string): Promise<void> {
  return invoke("studio_video_delete", { slug });
}

/** Turns the captions in the picture on or off (video.json's `captions`). */
export function setCaptions(slug: string, on: boolean): Promise<void> {
  return invoke("studio_set_captions", { slug, on });
}

/** Writes video.json's theme. `theme` is a name in effect for the video's
 *  subject; rejects with a sentence otherwise, or while a render or a
 *  narration of the video runs. */
export function setVideoTheme(slug: string, theme: string): Promise<void> {
  return invoke("studio_set_theme", { slug, theme });
}

/** Writes the video's own narration voice; null clears it, so the video
 *  follows Settings → Studio → Narration. Rejects as `setVideoTheme` does. */
export function setVideoVoice(slug: string, voice: string | null): Promise<void> {
  return invoke("studio_set_voice", { slug, voice });
}

/** The WebVTT text beside the video's `preset` render. */
export function renderCaptions(slug: string, preset: RenderPreset): Promise<string> {
  return invoke<string>("studio_render_captions", { slug, preset });
}

/** Where to take a still: `t` seconds into scene `scene`, or `global`
 *  seconds into the whole video. */
export type FrameAt = { scene: number; t: number } | { global: number };

/** A PNG `width` pixels wide. Rejects with a sentence fit to show, for
 *  instance when the narration is stale. */
export async function studioFrame(slug: string, at: FrameAt, width: number): Promise<Blob> {
  const bytes = await invoke<ArrayBuffer>("studio_frame", { slug, at, width });
  return new Blob([bytes], { type: "image/png" });
}

/** The video's cached thumbnail PNG. */
export async function studioThumbnail(slug: string): Promise<Blob> {
  const bytes = await invoke<ArrayBuffer>("studio_thumbnail", { slug });
  return new Blob([bytes], { type: "image/png" });
}
