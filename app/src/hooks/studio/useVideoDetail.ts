import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { videoDetail, type VideoDetail } from "@/lib/studio/videos";
import { useRenderStore } from "@/stores/studio/renderStore";

interface Snapshot {
  detail: VideoDetail | null;
  error: string | null;
  loading: boolean;
}

interface Entry {
  snapshot: Snapshot;
  listeners: Set<() => void>;
  /** A read is waiting for the end of this task, or running. */
  queued: boolean;
  running: boolean;
  /** Asked again while a read ran: its files may have changed since. */
  again: boolean;
}

const EMPTY: Snapshot = { detail: null, error: null, loading: false };
const entries = new Map<string, Entry>();

function entry(slug: string): Entry {
  let e = entries.get(slug);
  if (!e) {
    e = { snapshot: { ...EMPTY, loading: true }, listeners: new Set(), queued: false, running: false, again: false };
    entries.set(slug, e);
  }
  return e;
}

function publish(e: Entry, next: Partial<Snapshot>) {
  e.snapshot = { ...e.snapshot, ...next };
  e.listeners.forEach((l) => l());
}

async function read(slug: string, e: Entry) {
  e.running = true;
  do {
    e.again = false;
    try {
      publish(e, { detail: await videoDetail(slug), error: null, loading: false });
    } catch (err) {
      publish(e, { error: err instanceof Error ? err.message : String(err), loading: false });
    }
  } while (e.again);
  e.running = false;
}

/** Reads the video's detail once for every caller asking in the same task
 *  (a card, its Thread info row and the page beside it on one tool's end). */
export function reloadVideoDetail(slug: string): void {
  if (!slug) return;
  const e = entry(slug);
  if (e.running) {
    e.again = true;
    return;
  }
  if (e.queued) return;
  e.queued = true;
  setTimeout(() => {
    e.queued = false;
    void read(slug, e);
  }, 0);
}

/** One video's detail, shared by everything showing that slug, re-read
 *  when a render of it ends and on `reload` (a thread's turn or tool call
 *  finishing, which may have changed its files). */
export function useVideoDetail(slug: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!slug) return () => {};
      const e = entry(slug);
      e.listeners.add(listener);
      return () => e.listeners.delete(listener);
    },
    [slug],
  );
  const snapshot = useSyncExternalStore(subscribe, () => (slug ? entry(slug).snapshot : EMPTY));
  const reload = useCallback(() => reloadVideoDetail(slug), [slug]);

  useEffect(() => {
    reloadVideoDetail(slug);
  }, [slug]);

  const dir = snapshot.detail?.row.dir;
  const settled = useRenderStore((s) => (dir ? (s.settled[dir] ?? 0) : 0));
  // The count at first sight of the folder is not news.
  const seen = useRef<{ dir: string; n: number } | null>(null);
  useEffect(() => {
    if (!dir) return;
    if (seen.current?.dir !== dir) {
      seen.current = { dir, n: settled };
      return;
    }
    if (settled === seen.current.n) return;
    seen.current.n = settled;
    reloadVideoDetail(slug);
  }, [dir, settled, slug]);

  return { ...snapshot, reload };
}
