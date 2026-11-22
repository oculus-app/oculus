import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { exportStatus, type ExportStatus } from "@/lib/studio/render";
import { useNarrateStore } from "@/stores/studio/narrateStore";
import { useRenderStore } from "@/stores/studio/renderStore";

export interface ExportStatusSnapshot {
  rows: ExportStatus[] | null;
  error: string | null;
}

interface Entry {
  snapshot: ExportStatusSnapshot;
  listeners: Set<() => void>;
  queued: boolean;
  running: boolean;
  again: boolean;
}

const EMPTY: ExportStatusSnapshot = { rows: null, error: null };
const entries = new Map<string, Entry>();

function entry(dir: string): Entry {
  let e = entries.get(dir);
  if (!e) {
    e = { snapshot: EMPTY, listeners: new Set(), queued: false, running: false, again: false };
    entries.set(dir, e);
  }
  return e;
}

async function read(dir: string, e: Entry) {
  e.running = true;
  do {
    e.again = false;
    try {
      e.snapshot = { rows: await exportStatus(dir), error: null };
    } catch (err) {
      e.snapshot = { ...e.snapshot, error: err instanceof Error ? err.message : String(err) };
    }
    e.listeners.forEach((l) => l());
  } while (e.again);
  e.running = false;
}

/** Reads the folder's export statuses once for every caller asking in the
 *  same task (the render bar and the Export menu after one change). */
export function reloadExportStatus(dir: string): void {
  if (!dir) return;
  const e = entry(dir);
  if (e.running) {
    e.again = true;
    return;
  }
  if (e.queued) return;
  e.queued = true;
  setTimeout(() => {
    e.queued = false;
    void read(dir, e);
  }, 0);
}

/** The folder's export statuses (`studio_exports`), shared by the render bar
 *  and the Export menu. Read on `reloadExportStatus` only; `useExportStatusReads`
 *  says when. */
export function useExportStatus(dir: string): ExportStatusSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => {
      const e = entry(dir);
      e.listeners.add(listener);
      return () => {
        e.listeners.delete(listener);
        if (e.listeners.size === 0 && entries.get(dir) === e) entries.delete(dir);
      };
    },
    [dir],
  );
  return useSyncExternalStore(subscribe, () => entries.get(dir)?.snapshot ?? EMPTY);
}

/**
 * When the video page reads the statuses: when its folder first shows, when a
 * render or a narration of it ends, and when its files change while its
 * thread is idle, so a turn's every write is not a read. A theme, voice or
 * captions change asks by itself (`reloadExportStatus`).
 */
export function useExportStatusReads(dir: string, modified: number | null, running: boolean): void {
  const rendered = useRenderStore((s) => s.settled[dir] ?? 0);
  const narrated = useNarrateStore((s) => s.settled[dir] ?? 0);
  const [idle, setIdle] = useState(modified);
  useEffect(() => {
    if (!running) setIdle(modified);
  }, [running, modified]);
  useEffect(() => {
    reloadExportStatus(dir);
  }, [dir, rendered, narrated, idle]);
}
