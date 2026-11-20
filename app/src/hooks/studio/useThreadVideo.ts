import { useEffect, useMemo } from "react";

import { parseToolMeta } from "@/lib/harness";
import { lastStudioAction } from "@/lib/studio/activity";
import { videoProgress } from "@/lib/studio/progress";
import { itemsFor, useHarnessStore } from "@/stores/chat/harnessStore";
import { useRenderStore } from "@/stores/studio/renderStore";
import { useVideosStore } from "@/stores/studio/videosStore";
import { useVideoDetail } from "./useVideoDetail";

/**
 * The video a chat thread is making (`VideoRow.threadId`), its detail and
 * where it is (`videoProgress`). The detail is read again whenever a tool
 * call finishes or the turn ends, the moments its files can have changed,
 * and when a render the app ran ends (`useVideoDetail`).
 */
export function useThreadVideo(threadId: number | null) {
  const row = useVideosStore((s) => (threadId == null ? null : (s.videos.find((v) => v.threadId === threadId) ?? null)));
  const running = useHarnessStore((s) => threadId != null && !!s.live[threadId]?.running);
  const items = useHarnessStore((s) => itemsFor(threadId, s.items));
  const slug = row?.slug ?? "";
  const { detail, error, reload } = useVideoDetail(slug);
  const render = useRenderStore((s) => (row ? s.active[row.dir] : undefined));
  const renderError = useRenderStore((s) => (row ? s.errors[row.dir] : undefined));

  const last = useMemo(() => (slug ? lastStudioAction(items, slug, running) : null), [items, slug, running]);
  const finished = useMemo(
    () => items.reduce((n, i) => (i.kind === "tool" && parseToolMeta(i).ok != null ? n + 1 : n), 0),
    [items],
  );
  useEffect(() => {
    if (slug) void reload();
  }, [slug, running, finished, row?.modified, reload]);

  const progress = useMemo(
    () => videoProgress({ detail, running, render, error: error ?? renderError, last }),
    [detail, running, render, error, renderError, last],
  );
  return { row, detail, progress };
}
