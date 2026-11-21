import {
  capabilities, getThreadsByIds, harnessSend, liveRunId, waitingQuestions,
} from "@/lib/harness";
import { seriesPartRequest, seriesSendMode, seriesSendSelection } from "@/lib/studio/seriesRequest";
import { useChatPrefsStore } from "@/stores/chat/chatPrefsStore";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { usePickStore } from "@/stores/chat/pickStore";
import { useVideosStore } from "./videosStore";
import { createSeriesMakeStore } from "./seriesMakeState";

/** Read by id when the thread is older than Chat's newest page. */
export async function readSeriesThread(id: number) {
  const store = useHarnessStore.getState();
  const known = store.threads.find((t) => t.id === id);
  if (known) return known;
  const thread = (await getThreadsByIds([id]))[0];
  if (!thread) throw new Error("This series' chat was deleted. Reload the videos to start a new chat.");
  store.keep(thread);
  return useHarnessStore.getState().threads.find((t) => t.id === id) ?? thread;
}

export function seriesThreadRunning(threadId: number | null): boolean {
  if (threadId == null) return false;
  const store = useHarnessStore.getState();
  return store.live[threadId]?.running ?? store.threads.find((t) => t.id === threadId)?.status === "running";
}

export const useSeriesMakeStore = createSeriesMakeStore({
  running: seriesThreadRunning,
  send: async (series, partNumber, dispatching, openDraft) => {
    const request = seriesPartRequest(series, partNumber);
    if (series.threadId == null) return openDraft(series.subject, request.draft);
    const id = series.threadId;
    await readSeriesThread(id);
    const store = useHarnessStore.getState();
    try {
      await store.hold(id);
      await Promise.all([capabilities.load(), useChatPrefsStore.getState().load()]);
      const current = useHarnessStore.getState();
      const thread = await readSeriesThread(id);
      const selection = seriesSendSelection(thread, usePickStore.getState().held[id]);
      const runId = liveRunId(current.runs[id]);
      const run = runId == null ? null : current.runs[id]?.[runId] ?? null;
      const running = seriesThreadRunning(id);
      const mode = seriesSendMode({
        running, liveRun: run, caps: capabilities.of(run?.provider ?? thread.provider),
        questionWaits: waitingQuestions(current.requests[id]).length > 0,
      }, useChatPrefsStore.getState().followUp);
      dispatching();
      await harnessSend(id, selection.provider, request.text, { model: selection.model, reasoningEffort: selection.effort }, mode);
      usePickStore.getState().sent(id);
    } finally {
      store.unhold(id);
      store.release(id);
    }
  },
});

useVideosStore.subscribe((state) => useSeriesMakeStore.getState().observe(state.series));
useHarnessStore.subscribe((state, previous) => {
  const ended = new Set(Object.keys(state.live).map(Number).filter((id) =>
    state.live[id] !== previous.live[id] && !state.live[id].running && state.live[id].ended != null));
  useSeriesMakeStore.getState().observe(useVideosStore.getState().series, ended);
});
