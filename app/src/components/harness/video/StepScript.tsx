import { useRef } from "react";

import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { humanizeSlug } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";
import type { VideoDetail } from "@/lib/studio/videos";

/** The video's script, flat under the Script step: one row per scene with
 *  its number, title, length once timed, and selectable words. */
export function StepScript({ detail }: { detail: VideoDetail }) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollFade(scroller, "y");
  return (
    <div ref={scroller} className="max-h-64 divide-y divide-border-subtle overflow-y-auto">
      {detail.scenes.map((scene, i) => (
        <div key={scene.id ?? i} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="w-3 shrink-0 text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="truncate text-[12.5px] font-medium text-foreground">
                {scene.title ?? humanizeSlug(scene.id ?? scene.component)}
              </span>
            </div>
            {scene.duration != null && (
              <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                {fmtClockSecs(scene.duration)}
              </span>
            )}
          </div>
          <p data-selectable className="mt-1 pl-5 text-[12.5px] leading-relaxed text-foreground/80">
            {scene.text ?? <span className="text-muted-foreground">No narration</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
