import { useCallback, useEffect, useState } from "react";

import { narrationStatus, type NarrationStatus } from "@/lib/studio/narration";
import type { VideoDetail } from "@/lib/studio/videos";
import { useNarrateStore } from "@/stores/studio/narrateStore";

export interface NarrationRead {
  /** Null until read, and after a read that failed. */
  status: NarrationStatus | null;
  error: string | null;
  /** Reads again: the Settings voice may have changed. */
  reload: () => void;
}

/**
 * What a narration of the video would do now, for the voice picker and the
 * note beside the render: read when the page opens, when the video's voice,
 * script or narration changes, when a narration of the folder ends, and on
 * `reload`. The read is local and synthesises nothing.
 */
export function useNarrationStatus(detail: VideoDetail): NarrationRead {
  const { dir, slug } = detail.row;
  const settled = useNarrateStore((s) => s.settled[dir] ?? 0);
  const [asked, setAsked] = useState(0);
  const [read, setRead] = useState<{ status: NarrationStatus | null; error: string | null }>({
    status: null,
    error: null,
  });
  const { voice, scriptModified, narrationModified } = detail;

  useEffect(() => {
    let stale = false;
    narrationStatus(slug)
      .then((status) => !stale && setRead({ status, error: null }))
      .catch((e) => !stale && setRead({ status: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      stale = true;
    };
  }, [slug, settled, asked, voice, scriptModified, narrationModified]);

  const reload = useCallback(() => setAsked((n) => n + 1), []);
  return { ...read, reload };
}
