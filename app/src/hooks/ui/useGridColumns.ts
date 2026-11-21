import { useCallback, useLayoutEffect, useState } from "react";

import { countGridTracks } from "@/lib/ui/gridRun";

/** How many columns an `auto-fill` grid resolves to now, from its computed
 *  tracks: a count, so page zoom (which scales measured pixels) can't skew
 *  it. Re-read whenever the grid's width changes. Attach `ref` to the grid. */
export function useGridColumns(): { ref: (el: HTMLElement | null) => void; columns: number } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [columns, setColumns] = useState(1);
  const ref = useCallback((node: HTMLElement | null) => setEl(node), []);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => setColumns(countGridTracks(getComputedStyle(el).gridTemplateColumns));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref, columns };
}
