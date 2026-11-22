import { create } from "zustand";

import { cancelNarration, narrateVideo, type NarrateProgress, type NarrateSummary } from "@/lib/studio/narration";
import { useVideosStore } from "@/stores/studio/videosStore";

/** A narration in flight, keyed by the video's absolute folder. */
export interface ActiveNarration {
  slug: string;
  /** The scene being narrated, 1-based; 0 before the first. */
  n: number;
  /** Scenes in all; 0 until the first event says. */
  of: number;
  /** Scenes finished, narrated or kept. */
  done: number;
}

export interface NarrateState {
  active: Record<string, ActiveNarration>;
  /** The last failure per folder, until its next narration starts. */
  errors: Record<string, string>;
  /** Bumped when a narration of the folder ends, however it ended: a page
   *  showing the folder re-reads on it. */
  settled: Record<string, number>;
  start: (dir: string, slug: string) => Promise<void>;
  cancel: (dir: string, slug: string) => void;
  apply: (progress: NarrateProgress) => void;
}

export interface NarrateDeps {
  narrate: (slug: string) => Promise<NarrateSummary | null>;
  cancel: (slug: string) => Promise<boolean>;
  /** Re-reads the video list once a narration ends. */
  reload: () => void;
}

/** The folder's name, which is the slug. */
const slugOf = (dir: string) => dir.split(/[/\\]/).filter(Boolean).pop() ?? dir;

/**
 * Narrations started from the video page, fed by `studio-narrate-progress`
 * (`useStudioEvents`) and by `start`, which awaits the command. Like
 * `renderStore`, it outlives navigation, so the page's bar follows one run.
 */
export function createNarrateStore(deps: NarrateDeps) {
  return create<NarrateState>((set, get) => {
    /** Ends the folder's narration; a no-op when it already ended. */
    const settle = (dir: string, error?: string) => {
      if (!(dir in get().active)) return;
      set((s) => {
        const { [dir]: _ended, ...active } = s.active;
        const errors = error ? { ...s.errors, [dir]: error } : s.errors;
        return { active, errors, settled: { ...s.settled, [dir]: (s.settled[dir] ?? 0) + 1 } };
      });
      deps.reload();
    };

    return {
      active: {},
      errors: {},
      settled: {},

      start: async (dir, slug) => {
        if (dir in get().active) return;
        set((s) => {
          const { [dir]: _cleared, ...errors } = s.errors;
          return { errors, active: { ...s.active, [dir]: { slug, n: 0, of: 0, done: 0 } } };
        });
        try {
          // Null is a cancel; a failure rejects with a sentence fit to show.
          await deps.narrate(slug);
          settle(dir);
        } catch (e) {
          settle(dir, e instanceof Error ? e.message : String(e));
        }
      },

      cancel: (_dir, slug) => {
        deps.cancel(slug).catch((e) => console.error("cancel narration failed", e));
      },

      apply: (p) => {
        switch (p.phase) {
          case "complete":
          case "cancelled":
            settle(p.dir);
            return;
          case "error":
            settle(p.dir, p.error);
            return;
          case "scene":
          case "done": {
            const prev = get().active[p.dir];
            const done = Math.max(prev?.done ?? 0, p.phase === "done" ? p.n : p.n - 1);
            const next: ActiveNarration = { slug: prev?.slug ?? slugOf(p.dir), n: p.n, of: p.of, done };
            set((s) => ({ active: { ...s.active, [p.dir]: next } }));
          }
        }
      },
    };
  });
}

export const useNarrateStore = createNarrateStore({
  narrate: narrateVideo,
  cancel: cancelNarration,
  reload: () => void useVideosStore.getState().reload(),
});
