import { useEffect, useState } from "react";
import { getThreadsByIds, type HarnessThread } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";

/** The wait before a failed read by id is tried again, doubling to the cap. */
export const RETRY_FIRST_MS = 250;
const RETRY_MAX_MS = 30_000;

/**
 * The thread a Chat tab's route names, a subagent's parent (its crumb and
 * brief, `ThreadTrail`, `BriefFrom`), or a Subagent card's child. The store
 * lists the newest threads, so an older one (a restored tab, a ⌘-click from
 * search) is read by id and kept in the list; with `keep: false` (the card,
 * which only asks whether its child exists) it is held in `known` instead,
 * so old children do not join the Chat column. `missing` only once that
 * read succeeds and finds nothing, so the page walks back to a new chat for
 * a deleted thread, never for an old one or a read that failed (which is
 * tried again, the wait doubling per failure of the same id).
 */
export function useRouteThread(
  activeId: number | null,
  { keep = true }: { keep?: boolean } = {},
): { thread: HarnessThread | null; missing: boolean } {
  const thread = useHarnessStore((s) =>
    activeId == null ? null : (s.threads.find((t) => t.id === activeId) ?? (keep ? null : s.known[activeId] ?? null)),
  );
  const loaded = useHarnessStore((s) => s.threadsLoaded);
  const [gone, setGone] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ id: number | null; n: number }>({ id: null, n: 0 });
  const failures = failed.id === activeId ? failed.n : 0;
  const absent = loaded && activeId != null && thread == null;
  const lookUp = absent && gone !== activeId;
  useEffect(() => {
    if (!lookUp || activeId == null) return;
    let live = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    getThreadsByIds([activeId])
      .then(([found]) => {
        if (!live) return;
        setFailed({ id: null, n: 0 });
        const store = useHarnessStore.getState();
        if (!found) setGone(activeId);
        else if (keep) store.keep(found);
        else store.know(found);
      })
      .catch((e) => {
        console.error("thread read failed", e);
        const again = () => setFailed((f) => ({ id: activeId, n: (f.id === activeId ? f.n : 0) + 1 }));
        if (live) retry = setTimeout(again, Math.min(RETRY_FIRST_MS * 2 ** failures, RETRY_MAX_MS));
      });
    return () => {
      live = false;
      clearTimeout(retry);
    };
  }, [lookUp, activeId, failures, keep]);
  return { thread, missing: absent && gone === activeId };
}
