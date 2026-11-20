import { useCallback, useEffect, useRef, useState } from "react";

import { videoDetail, type VideoDetail } from "@/lib/studio/videos";
import { useRenderStore } from "@/stores/studio/renderStore";

/** One video's detail, re-read when a render of it ends and on `reload`
 *  (a thread's turn finishing, which may have changed its files). */
export function useVideoDetail(slug: string) {
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const dir = detail?.row.dir;
  const settled = useRenderStore((s) => (dir ? (s.settled[dir] ?? 0) : 0));

  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!slug) return;
    const mine = ++generation.current;
    try {
      const next = await videoDetail(slug);
      if (mine !== generation.current) return;
      setDetail(next);
      setError(null);
    } catch (e) {
      if (mine !== generation.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setLoading(!!slug);
    void reload();
    return () => { generation.current++; };
  }, [reload]);

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
    void reload();
  }, [dir, settled, reload]);

  return { detail, error, loading, reload };
}
