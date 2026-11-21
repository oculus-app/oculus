import { create } from "zustand";

import { listVideosAndSeries, type StudioSeries, type VideoList, type VideoRow } from "@/lib/studio/videos";

interface VideosState {
  /** Newest first. */
  videos: VideoRow[];
  series: StudioSeries[];
  loaded: boolean;
  /** The last read's failure, shown in place of the list. */
  error: string | null;
  reload: () => Promise<void>;
}

/** One atomic video/series read; a slow answer cannot overwrite a newer one. */
export function createVideosStore(read: () => Promise<VideoList>) {
  let run = 0;
  return create<VideosState>((set) => ({
    videos: [],
    series: [],
    loaded: false,
    error: null,
    reload: async () => {
      const mine = ++run;
      try {
        const { videos, series } = await read();
        if (mine === run) set({ videos, series, loaded: true, error: null });
      } catch (e) {
        if (mine === run) set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
      }
    },
  }));
}

export const useVideosStore = createVideosStore(listVideosAndSeries);
