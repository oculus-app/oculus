import { useCallback, useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { partsBeingMade, partThreads } from "@/lib/studio/seriesView";
import { threadRunning } from "@/lib/studio/threadRunning";
import type { StudioSeries } from "@/lib/studio/videos";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { rememberedThreads } from "@/stores/studio/seriesMakeState";
import { keepThread, useSeriesMakeStore } from "@/stores/studio/seriesMakeStore";
import { useNewVideoChat, useShowNewChat } from "./useNewVideoChat";

export interface MakeSeriesPartState {
  /** Each part's chat by part number (`partThread`); a part with none is absent. */
  threads: Readonly<Record<number, number>>;
  /** The parts being made, in order (`partsBeingMade`). */
  making: readonly number[];
  /** Opens the part's new chat with the request in its box, unsent, or
   *  shows the one already open for it. */
  make: (series: StudioSeries, partNumber: number) => void;
}

const NO_THREADS: Readonly<Record<number, number>> = {};
const NOT_REMEMBERED: Readonly<Record<string, number>> = {};
const NONE: readonly number[] = [];

/** One series' parts and their chats, shared by every surface that shows them. */
export function useMakeSeriesPart(series: StudioSeries | null): MakeSeriesPartState {
  const fresh = useNewVideoChat();
  const show = useShowNewChat();
  const remembered = useSeriesMakeStore(useShallow((s) => (series ? rememberedThreads(s.chats, series.slug) : NOT_REMEMBERED)));
  const threads = useMemo(() => (series ? partThreads(series, remembered) : NO_THREADS), [series, remembered]);
  const making = useHarnessStore(useShallow((s) => (series ? partsBeingMade(series, threads, (id) => threadRunning(s, id)) : NONE)));
  // A part's chat can be older than Chat's newest page of threads; a made
  // part's chat is not followed, so it is not read.
  const ids = series ? series.parts.filter((p) => !p.made && threads[p.number] != null).map((p) => threads[p.number]).join(",") : "";
  useEffect(() => {
    for (const id of ids ? ids.split(",").map(Number) : []) void keepThread(id).catch(() => {});
  }, [ids]);
  const make = useCallback(
    (target: StudioSeries, number: number) => useSeriesMakeStore.getState().make(target, number, { fresh, show }),
    [fresh, show],
  );
  return { threads, making, make };
}
