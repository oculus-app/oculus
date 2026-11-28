import { create } from "zustand";
import { ask, dismiss, EMPTY_PROMPT, step, type Prompt, type View } from "@/lib/browser/downloads/prompt";
import { isProblem, type Download, type DownloadsSnapshot } from "@/lib/browser/downloads/types";

/** A mirror of Rust's download list (`app/src-tauri/src/shell/browser/downloads/`),
 *  fed by `useBrowserDownloads`, with which download the Save dialog is
 *  asking about (`lib/browser/downloads/prompt.ts`). */
interface DownloadsState {
  downloads: Download[];
  /** Whether any download has been seen this session: the toolbar's button
   *  shows from then on, even once the list is cleared. */
  seen: boolean;
  /** A download failed or was refused since the list was last opened: the
   *  toolbar's button marks it, as nothing else says so. */
  problem: boolean;
  prompt: Prompt;
  /** Each download saved to Drive's `files` row id, once recorded: the row
   *  follows the file through Drive's moves and renames. */
  files: Record<number, number>;
  /** Why a download saved to Drive can never get its `files` row. */
  unrecorded: Record<number, string>;
  /** The tabs in front and the live tabs, as last reported. */
  view: View;
  /** A list from Rust; `initial` for the mount's fetch, which asks nothing. */
  apply: (snapshot: DownloadsSnapshot, now: number, initial?: boolean) => void;
  setView: (view: View, now: number) => void;
  /** An undecided arrival may have waited long enough. */
  tick: (now: number) => void;
  /** Opens the dialog for a waiting download. */
  ask: (id: number) => void;
  dismiss: () => void;
  /** The list was opened: its problems have been seen. */
  acknowledge: () => void;
  setFile: (download: number, file: number) => void;
  setUnrecorded: (download: number, reason: string) => void;
}

export const useBrowserDownloadsStore = create<DownloadsState>((set) => ({
  downloads: [],
  seen: false,
  problem: false,
  prompt: EMPTY_PROMPT,
  files: {},
  unrecorded: {},
  view: { front: [], live: new Set() },
  apply: (snapshot, now, initial = false) =>
    set((s) => ({
      downloads: snapshot.downloads,
      seen: s.seen || snapshot.downloads.length > 0,
      problem:
        s.problem ||
        (!initial && snapshot.downloads.some((d) => isProblem(d) && s.prompt.states[d.id] !== d.state)),
      prompt: step(s.prompt, snapshot.downloads, s.view, now, initial),
    })),
  setView: (view, now) =>
    set((s) => ({ view, prompt: step(s.prompt, s.downloads, view, now) })),
  tick: (now) => set((s) => ({ prompt: step(s.prompt, s.downloads, s.view, now) })),
  ask: (id) => set((s) => ({ prompt: ask(s.prompt, s.downloads, id) })),
  dismiss: () => set((s) => ({ prompt: dismiss(s.prompt) })),
  acknowledge: () => set((s) => (s.problem ? { problem: false } : s)),
  setFile: (download, file) =>
    set((s) => (s.files[download] === file ? s : { files: { ...s.files, [download]: file } })),
  setUnrecorded: (download, reason) =>
    set((s) => ({ unrecorded: { ...s.unrecorded, [download]: reason } })),
}));

/** The download the dialog shows, or undefined. */
export function useAskedDownload(): Download | undefined {
  return useBrowserDownloadsStore((s) =>
    s.prompt.open == null ? undefined : s.downloads.find((d) => d.id === s.prompt.open),
  );
}
