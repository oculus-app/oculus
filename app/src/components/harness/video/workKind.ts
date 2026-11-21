import { useMemo } from "react";
import { FilmSlate } from "@phosphor-icons/react";

import { registerWorkKind, type WorkRow } from "@/components/harness/threadInfo/work";
import { useThreadVideo } from "@/hooks/studio/useThreadVideo";
import { videoHref } from "@/lib/studio/routes";

/** Thread info's Work row for the video a thread is making, as its card
 *  draws it: the title (a series' for a series), the status line, and the
 *  page of the part the card follows, opened beside the chat. */
registerWorkKind({
  id: "studio-video",
  useRows: (thread) => {
    const { row, status, series } = useThreadVideo(thread.id);
    const page = row ?? series?.part ?? null;
    const title = series?.series.title ?? row?.title ?? "";
    return useMemo<WorkRow[]>(
      () =>
        page
          ? [
              {
                key: `video:${page.slug}`,
                icon: FilmSlate,
                title,
                status: status.label,
                tone: status.tone,
                href: videoHref(page.slug, page.title),
              },
            ]
          : [],
      [page, title, status.label, status.tone],
    );
  },
});
