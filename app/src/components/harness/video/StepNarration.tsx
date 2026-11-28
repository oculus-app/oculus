import { useEffect, useRef, useState } from "react";
import { Microphone, Play, Stop } from "@phosphor-icons/react";

import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { humanizeSlug } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";
import { kokoroVoicesStatus } from "@/lib/studio/kokoroVoices";
import { videoSeconds, type VideoDetail } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";
import { useNarrationClip } from "./useNarrationClip";

/** The narration's voice and scene timings, flat under the Narration step.
 *  Clicking a narrated scene plays its own clip (`useNarrationClip`), with
 *  or without a render; a silent scene's row is not a button. */
export function StepNarration({ detail }: { detail: VideoDetail }) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollFade(scroller, "y");
  const clip = useNarrationClip(detail.narrationModified);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const voiceId = detail.voice;

  useEffect(() => {
    setVoiceName(null);
    if (!voiceId) return;
    let stale = false;
    kokoroVoicesStatus()
      .then((voices) => {
        if (stale) return;
        const match = voices.find((v) => v.id === voiceId);
        if (match) setVoiceName(match.name);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [voiceId]);

  const total = videoSeconds(detail);
  const voiceLabel = voiceName ?? voiceId;

  const header = !!voiceLabel || total != null;

  return (
    <div>
      {header && (
        <div className="flex items-center justify-between gap-2 pb-1.5 text-[11.5px] text-muted-foreground tabular-nums">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {voiceLabel && <Microphone size={12} className="shrink-0" />}
            <span className="truncate">{voiceLabel ?? "Narration"}</span>
          </span>
          {total != null && <span className="shrink-0">{fmtClockSecs(total)}</span>}
        </div>
      )}
      <audio ref={clip.ref} preload="none" className="hidden" />
      <div className={cn(header && "border-t border-border-subtle")}>
        <div ref={scroller} className="-mx-1.5 max-h-56 divide-y divide-border-subtle overflow-y-auto">
          {detail.scenes.map((scene, i) => {
            const title = scene.title ?? humanizeSlug(scene.id ?? scene.component);
            const audio = scene.audio;
            const playing = clip.playing === i;
            const Icon = playing ? Stop : Play;
            const body = (
              <>
                <span className={cn("w-9 shrink-0 text-[11.5px] text-muted-foreground tabular-nums", playing && "text-brand")}>
                  {scene.start != null ? fmtClockSecs(scene.start) : `${i + 1}`}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12.5px]",
                    playing ? "font-medium text-brand" : audio ? "text-foreground/90" : "text-muted-foreground",
                  )}
                >
                  {title}
                </span>
                {audio && (
                  <Icon
                    size={11}
                    weight="fill"
                    className={cn(
                      "shrink-0 transition-opacity will-change-[opacity]",
                      playing ? "text-brand" : "text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
                    )}
                  />
                )}
                {scene.duration != null && (
                  <span className={cn("shrink-0 text-[11.5px] text-muted-foreground tabular-nums", playing && "text-brand")}>
                    {fmtClockSecs(scene.duration)}
                  </span>
                )}
              </>
            );
            if (audio) {
              return (
                <button
                  key={scene.id ?? i}
                  type="button"
                  aria-pressed={playing}
                  aria-label={`${playing ? "Stop" : "Play"} the narration of ${title}`}
                  onClick={() => clip.toggle(i, audio)}
                  className={cn(
                    "group flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none",
                    playing ? "bg-brand-muted" : "hover:bg-accent",
                  )}
                >
                  {body}
                </button>
              );
            }
            return (
              <div key={scene.id ?? i} title="No narration for this scene" className="flex items-center gap-2 px-1.5 py-1.5">
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
