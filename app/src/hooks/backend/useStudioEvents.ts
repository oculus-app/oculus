import { useTauriEvent } from "@/hooks/backend/useEvents";
import { NARRATE_PROGRESS_EVENT, type NarrateProgress } from "@/lib/studio/narration";
import type { RenderProgress } from "@/lib/studio/render";
import { useNarrateStore } from "@/stores/studio/narrateStore";
import { useRenderStore } from "@/stores/studio/renderStore";

/** Render progress into `renderStore`, for the rail's dot and each page's
 *  bar, and a page-started narration's into `narrateStore`. */
export function useStudioEvents() {
  useTauriEvent<RenderProgress>("studio-render-progress", (e) => useRenderStore.getState().apply(e.payload));
  useTauriEvent<NarrateProgress>(NARRATE_PROGRESS_EVENT, (e) => useNarrateStore.getState().apply(e.payload));
}
