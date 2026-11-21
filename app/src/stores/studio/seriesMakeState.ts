import { create } from "zustand";
import type { StudioSeries } from "@/lib/studio/videos";

export interface SeriesMakeRequest {
  requestedPart: number | null;
  threadId: number | null;
  sending: boolean;
  error: string | null;
  /** Lifecycle flags keep a fast turn's end even before the send resolves. */
  dispatched: boolean;
  sawRunning: boolean;
  ended: boolean;
}

export const EMPTY_SERIES_REQUEST: SeriesMakeRequest = {
  requestedPart: null, threadId: null, sending: false, error: null,
  dispatched: false, sawRunning: false, ended: false,
};

export type OpenSeriesDraft = (subject: string | null, text: string) => Promise<void>;

export interface SeriesMakeDependencies {
  send: (series: StudioSeries, partNumber: number, dispatching: () => void, openDraft: OpenSeriesDraft) => Promise<void>;
  running: (threadId: number | null) => boolean;
}

/** Shared requests live outside React so navigation never owns their lifetime. */
export function createSeriesMakeStore(deps: SeriesMakeDependencies) {
  return create<{
    requests: Record<string, SeriesMakeRequest>;
    make: (series: StudioSeries, partNumber: number, openDraft: OpenSeriesDraft) => Promise<boolean>;
    observe: (series: StudioSeries[], endedThreads?: ReadonlySet<number>) => void;
  }>((set, get) => {
    const put = (slug: string, request: SeriesMakeRequest) => set((s) => ({ requests: { ...s.requests, [slug]: request } }));
    return {
      requests: {},
      make: async (series, partNumber, openDraft) => {
        const prior = get().requests[series.slug];
        if (prior?.sending || prior?.requestedPart != null) return false;
        put(series.slug, { ...EMPTY_SERIES_REQUEST, requestedPart: partNumber, threadId: series.threadId, sending: true });
        try {
          await deps.send(series, partNumber, () => {
            put(series.slug, { ...get().requests[series.slug], dispatched: true, sawRunning: deps.running(series.threadId), ended: false });
          }, openDraft);
          const request = get().requests[series.slug];
          put(series.slug, {
            ...request, sending: false,
            requestedPart: series.threadId == null || request.ended ? null : request.requestedPart,
          });
          return true;
        } catch (e) {
          put(series.slug, { ...EMPTY_SERIES_REQUEST, threadId: series.threadId, error: e instanceof Error ? e.message : String(e) });
          return false;
        }
      },
      observe: (series, endedThreads = new Set()) => {
        for (const [slug, request] of Object.entries(get().requests)) {
          if (request.requestedPart == null) continue;
          const running = deps.running(request.threadId);
          const made = series.find((s) => s.slug === slug)?.parts.find((p) => p.number === request.requestedPart)?.made;
          const ended = request.ended || (request.dispatched && !running &&
            (request.sawRunning || (request.threadId != null && endedThreads.has(request.threadId))));
          const next = {
            ...request,
            sawRunning: request.sawRunning || (request.dispatched && running),
            ended,
            requestedPart: made || (ended && !request.sending) ? null : request.requestedPart,
          };
          if (next.sawRunning !== request.sawRunning || next.ended !== request.ended || next.requestedPart !== request.requestedPart) put(slug, next);
        }
      },
    };
  });
}
