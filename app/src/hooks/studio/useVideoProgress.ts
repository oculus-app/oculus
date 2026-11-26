import { useEffect, useMemo } from "react";

import { parseToolMeta } from "@/lib/harness";
import { failedStep, lastStudioAction, touchesVideo } from "@/lib/studio/activity";
import { videoProgress } from "@/lib/studio/progress";
import { threadRunning } from "@/lib/studio/threadRunning";
import type { VideoRow } from "@/lib/studio/videos";
import { itemsFor, useHarnessStore } from "@/stores/chat/harnessStore";
import { useRenderStore } from "@/stores/studio/renderStore";
import { useVideosStore } from "@/stores/studio/videosStore";
import { useVideoDetail } from "./useVideoDetail";

/**
 * One video's detail and where it is (`videoProgress`) as the thread making
 * it sees it. The detail is read again whenever a tool call finishes or the
 * turn ends, the moments its files can have changed, and when a render the
 * app ran ends (`useVideoDetail`). With no row there is no detail.
 */
export function useVideoProgress(row: VideoRow | null, threadId: number | null) {
  const running = useHarnessStore((s) => threadRunning(s, threadId));
  const items = useHarnessStore((s) => itemsFor(threadId, s.items));
  const slug = row?.slug ?? "";
  const { detail, error, reload } = useVideoDetail(slug);
  const render = useRenderStore((s) => (row ? s.active[row.dir] : undefined));
  const renderError = useRenderStore((s) => (row ? s.errors[row.dir] : undefined));
  const failedPreset = useRenderStore((s) => (row ? s.failedPresets[row.dir] : undefined));

  const last = useMemo(() => (slug ? lastStudioAction(items, slug, running) : null), [items, slug, running]);
  const failed = useMemo(() => (slug ? failedStep(items, slug) : null), [items, slug]);
  const working = useMemo(() => running && !!slug && touchesVideo(items, slug), [items, slug, running]);
  const finished = useMemo(
    () => items.reduce((n, i) => (i.kind === "tool" && parseToolMeta(i).ok != null ? n + 1 : n), 0),
    [items],
  );
  useEffect(() => {
    if (slug) void reload();
  }, [slug, running, finished, row?.modified, reload]);

  // A read that fails may mean the folder was deleted (in Finder, say): the
  // list then drops the row, and whatever shows it.
  useEffect(() => {
    if (error) void useVideosStore.getState().reload();
  }, [error]);

  const progress = useMemo(
    () =>
      videoProgress({
        detail,
        running,
        working,
        render,
        readError: error,
        renderFailure: renderError && failedPreset ? { message: renderError, preset: failedPreset } : null,
        last,
        failed,
      }),
    [detail, running, working, render, error, renderError, failedPreset, last, failed],
  );
  return { detail: row ? detail : null, progress, running };
}
