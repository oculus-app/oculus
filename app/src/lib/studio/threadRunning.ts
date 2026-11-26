/** What `threadRunning` reads of the harness store. */
export interface ThreadTurns {
  live: Readonly<Record<number, { running: boolean } | undefined>>;
  threads: readonly { id: number; status: string }[];
}

/** Whether a thread's turn runs: the live map when it holds the thread, else
 *  the thread row's status (a thread no view has read has no live entry). */
export function threadRunning(s: ThreadTurns, id: number | null): boolean {
  if (id == null) return false;
  return s.live[id]?.running ?? s.threads.find((t) => t.id === id)?.status === "running";
}

/** Whether the store has read the thread at all, so "not running" means something. */
export function threadKnown(s: ThreadTurns, id: number): boolean {
  return s.live[id] != null || s.threads.some((t) => t.id === id);
}
