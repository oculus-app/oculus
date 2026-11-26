import { useEffect, useRef, useState } from "react";
import { Microphone, Play } from "@phosphor-icons/react";

import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { humanizeSlug } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";
import { kokoroVoicesStatus } from "@/lib/studio/kokoroVoices";
import { videoSeconds, type VideoDetail } from "@/lib/studio/videos";

/** The narration's voice and scene timings, nested inside the Narration step.
 *  When a render exists, clicking a scene starts playback there. */
export function StepNarration({
  detail,
  playable,
  onPlayAt,
}: {
  detail: VideoDetail;
  playable: boolean;
  onPlayAt: (at: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useScrollFade(scroller, "y");
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

  return (
    <div className="overflow-hidden rounded-lg border border-border-subtle bg-surface/50">
      {(voiceLabel || total != null) && (
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5 text-[11.5px] text-muted-foreground tabular-nums">
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {voiceLabel && <Microphone size={12} className="shrink-0" />}
            <span className="truncate">{voiceLabel ?? "Narration"}</span>
          </span>
          {total != null && <span className="shrink-0">{fmtClockSecs(total)}</span>}
        </div>
      )}
      <div ref={scroller} className="max-h-56 divide-y divide-border-subtle overflow-y-auto">
        {detail.scenes.map((scene, i) => {
          const title = scene.title ?? humanizeSlug(scene.id ?? scene.component);
          const canJump = playable && scene.start != null;
          const body = (
            <>
              <span className="w-9 shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
                {scene.start != null ? fmtClockSecs(scene.start) : `${i + 1}`}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground/90">{title}</span>
              {canJump && (
                <Play
                  size={11}
                  weight="fill"
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
              )}
              {scene.duration != null && (
                <span className="shrink-0 text-[11.5px] text-muted-foreground tabular-nums">
                  {fmtClockSecs(scene.duration)}
                </span>
              )}
            </>
          );
          if (canJump) {
            return (
              <button
                key={scene.id ?? i}
                type="button"
                onClick={() => onPlayAt(scene.start!)}
                className="group flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent"
              >
                {body}
              </button>
            );
          }
          return (
            <div key={scene.id ?? i} className="flex items-center gap-2 px-3 py-1.5">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
