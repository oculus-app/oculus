import { useCallback, useEffect } from "react";
import type { StudioSeries } from "@/lib/studio/videos";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { EMPTY_SERIES_REQUEST } from "@/stores/studio/seriesMakeState";
import { readSeriesThread, useSeriesMakeStore } from "@/stores/studio/seriesMakeStore";
import { useNewVideoChat } from "./useNewVideoChat";

export interface MakeSeriesPartState {
  requestedPart: number | null;
  running: boolean;
  sending: boolean;
  error: string | null;
  make: (series: StudioSeries, partNumber: number) => Promise<boolean>;
}

/** Observe one series; requests and failures are shared by every mounted surface. */
export function useMakeSeriesPart(series: StudioSeries | null): MakeSeriesPartState {
  const openDraft = useNewVideoChat();
  const request = useSeriesMakeStore((s) => series ? s.requests[series.slug] ?? EMPTY_SERIES_REQUEST : EMPTY_SERIES_REQUEST);
  const threadId = series?.threadId ?? null;
  const running = useHarnessStore((s) => threadId != null &&
    (s.live[threadId]?.running ?? s.threads.find((t) => t.id === threadId)?.status === "running"));
  useEffect(() => {
    if (threadId != null) void readSeriesThread(threadId).catch(() => {});
  }, [threadId]);
  const make = useCallback((target: StudioSeries, number: number) => useSeriesMakeStore.getState().make(target, number, openDraft), [openDraft]);
  return {
    requestedPart: request.requestedPart, running, sending: request.sending, error: request.error,
    make,
  };
}
