import { useCallback, useEffect } from "react";

import { useStoredSet } from "@/hooks/ui/useStoredState";
import type { StudioSeries } from "@/lib/studio/videos";

/** The Videos grid's open folders, by series slug, kept across visits. */
export const OPEN_SERIES_KEY = "oculus-studio-open-series";

/** `open` without the slugs no series has any more; the same set when nothing goes. */
export function keepListedSeries(open: Set<string>, series: StudioSeries[]): Set<string> {
  const listed = new Set(series.map((s) => s.slug));
  return [...open].every((slug) => listed.has(slug)) ? open : new Set([...open].filter((slug) => listed.has(slug)));
}

/** Which series folders are open. A folder whose series leaves a good read
 *  is forgotten; a failed read forgets nothing. */
export function useOpenSeries(series: StudioSeries[], settled: boolean) {
  const [open, setOpen] = useStoredSet(OPEN_SERIES_KEY);
  useEffect(() => {
    if (settled) setOpen((prev) => keepListedSeries(prev, series));
  }, [series, settled, setOpen]);
  const toggle = useCallback(
    (slug: string) =>
      setOpen((prev) => {
        const next = new Set(prev);
        if (!next.delete(slug)) next.add(slug);
        return next;
      }),
    [setOpen],
  );
  return { open, toggle };
}
