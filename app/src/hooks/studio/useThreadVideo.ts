import { useMemo } from "react";

import { seriesForThread, type SeriesMembership } from "@/lib/studio/series";
import { partStatus, seriesStatusLabel, type PartStatus } from "@/lib/studio/seriesView";
import { threadRunning } from "@/lib/studio/threadRunning";
import type { VideoRow } from "@/lib/studio/videos";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { chatForThread } from "@/stores/studio/seriesMakeState";
import { useSeriesMakeStore } from "@/stores/studio/seriesMakeStore";
import { useVideosStore } from "@/stores/studio/videosStore";
import { useVideoProgress } from "./useVideoProgress";

/** Which video a thread's card is about: its series part, else the video
 *  linked to it. */
function useThreadVideoRow(threadId: number | null) {
  const allSeries = useVideosStore((s) => s.series);
  const videos = useVideosStore((s) => s.videos);
  const opened = useSeriesMakeStore((s) => (threadId == null ? null : chatForThread(s.chats, threadId)));
  const inSeries = useMemo<SeriesMembership | null>(
    () => seriesForThread(allSeries, threadId, opened),
    [allSeries, threadId, opened],
  );
  const single = useMemo(
    () => (inSeries || threadId == null ? null : (videos.find((v) => v.threadId === threadId) ?? null)),
    [inSeries, videos, threadId],
  );
  const row: VideoRow | null = inSeries ? (inSeries.part?.video ?? null) : single;
  return { inSeries, row };
}

/** The folder of the video a thread's card shows: null for a series part
 *  with no folder yet, undefined for a thread with no card. */
export function useThreadVideoSlug(threadId: number | null): string | null | undefined {
  const { inSeries, row } = useThreadVideoRow(threadId);
  return row ? row.slug : inSeries ? null : undefined;
}

/**
 * The video a chat thread is making and where it is. A thread that makes a
 * series' part (`seriesForThread`: the part whose folder is linked to it, or
 * that its new chat was opened for) follows that part, and its status line
 * names it. Any other thread has the video linked to it (`VideoRow.threadId`),
 * if any. A video whose folder is gone leaves the list, and the thread has no video.
 */
export function useThreadVideo(threadId: number | null) {
  const { inSeries, row } = useThreadVideoRow(threadId);
  const running = useHarnessStore((s) => threadRunning(s, threadId));

  const part = inSeries?.part ?? null;
  const { detail, progress } = useVideoProgress(row, threadId);

  const status = useMemo<PartStatus>(() => {
    if (!inSeries || !part) return { label: progress.label, tone: progress.tone };
    const s = partStatus({ part, making: !part.made && running, progress });
    return { label: seriesStatusLabel(part, inSeries.series.parts.length, s), tone: s.tone };
  }, [inSeries, part, running, progress]);

  return { row, detail, progress, status, series: inSeries };
}
