import { useMemo } from "react";

import { seriesForThread } from "@/lib/studio/series";
import { cardPartNumber, partBeingMade, partStatus, seriesStatusLabel, type PartStatus } from "@/lib/studio/seriesView";
import type { SeriesPart, StudioSeries, VideoRow } from "@/lib/studio/videos";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useSeriesMakeStore } from "@/stores/studio/seriesMakeStore";
import { useVideosStore } from "@/stores/studio/videosStore";
import { useVideoProgress } from "./useVideoProgress";

/** A thread that makes a series: the card follows one part (`cardPartNumber`). */
export interface ThreadSeries {
  series: StudioSeries;
  part: SeriesPart;
  /** The part being made, if any (`partBeingMade`). */
  making: number | null;
}

/**
 * The video a chat thread is making and where it is. A thread that makes a
 * series (`seriesForThread`) follows the part being made, else the part
 * whose folder changed last; its status line names the part. Any other
 * thread has the video linked to it (`VideoRow.threadId`), if any. A video
 * whose folder is gone leaves the list, and the thread has no video.
 */
export function useThreadVideo(threadId: number | null) {
  const series = useVideosStore((s) => seriesForThread(s.series, threadId));
  const single = useVideosStore((s) =>
    threadId == null || seriesForThread(s.series, threadId) ? null : (s.videos.find((v) => v.threadId === threadId) ?? null),
  );
  const requested = useSeriesMakeStore((s) => (series ? (s.requests[series.slug]?.requestedPart ?? null) : null));
  const sending = useSeriesMakeStore((s) => (series ? (s.requests[series.slug]?.sending ?? false) : false));
  const running = useHarnessStore((s) => threadId != null && !!s.live[threadId]?.running);

  const making = series ? partBeingMade(series, requested, running) : null;
  const partNumber = series ? cardPartNumber(series, making) : null;
  const part = series?.parts.find((p) => p.number === partNumber) ?? null;
  const row: VideoRow | null = series ? (part?.video ?? null) : single;
  const { detail, progress } = useVideoProgress(row, threadId);

  const status = useMemo<PartStatus>(() => {
    if (!series || !part) return { label: progress.label, tone: progress.tone };
    const s = partStatus({ part, making: making === part.number, sending, running, progress });
    return { label: seriesStatusLabel(part, series.parts.length, s), tone: s.tone };
  }, [series, part, making, sending, running, progress]);

  const inSeries = useMemo<ThreadSeries | null>(
    () => (series && part ? { series, part, making } : null),
    [series, part, making],
  );
  return { row, detail, progress, status, series: inSeries };
}
