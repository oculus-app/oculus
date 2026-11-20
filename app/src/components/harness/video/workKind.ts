import { useMemo } from "react";
import { FilmSlate } from "@phosphor-icons/react";

import { registerWorkKind, type WorkRow } from "@/components/harness/threadInfo/work";
import { useThreadVideo } from "@/hooks/studio/useThreadVideo";
import { videoHref } from "@/lib/studio/routes";

/** Thread info's Work row for the video a thread is making: its title and
 *  the card's status line, opening the video beside the chat. */
registerWorkKind({
  id: "studio-video",
  useRows: (thread) => {
    const { row, progress } = useThreadVideo(thread.id);
    return useMemo<WorkRow[]>(
      () =>
        row
          ? [
              {
                key: `video:${row.slug}`,
                icon: FilmSlate,
                title: row.title,
                status: progress.label,
                tone: progress.tone,
                href: videoHref(row.slug, row.title),
              },
            ]
          : [],
      [row, progress.label, progress.tone],
    );
  },
});
