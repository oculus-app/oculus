import { useState } from "react";
import { CaretLeft, CaretRight, Play } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useSceneStill } from "@/hooks/studio/useSceneStill";
import { humanizeSlug } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";
import type { SceneInfo, VideoDetail } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";

const ARROW =
  "absolute top-1/2 flex size-[30px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white transition-[opacity,background-color] will-change-[opacity] hover:bg-black/60 disabled:cursor-default disabled:opacity-30";

/** The scene's still, from `studio_frame`; a failure (a stale narration)
 *  says why in its place. */
function Still({ detail, index, scene }: { detail: VideoDetail; index: number; scene: SceneInfo }) {
  const [problem, setProblem] = useState<string | null>(null);
  const still = useSceneStill(detail, index, scene, 640, setProblem);
  if (still.url) return <img src={still.url} alt="" draggable={false} className="size-full object-contain" />;
  return <span className="px-6 text-center text-[13px]">{problem ?? "Drawing the still…"}</span>;
}

/**
 * The card's storyboard: one scene's still at a time, with arrows and a chip
 * per scene (dashed while its component is not written), then the scene's
 * title, start, length and narration. Play from this scene starts the inline
 * player there.
 */
export function Storyboard({
  detail,
  playable,
  onPlay,
}: {
  detail: VideoDetail;
  playable: boolean;
  onPlay: (at: number) => void;
}) {
  const [selected, setSelected] = useState(0);
  const count = detail.scenes.length;
  if (count === 0) return <p className="text-[13px] text-muted-foreground">No scenes yet.</p>;
  const index = Math.min(selected, count - 1);
  const scene = detail.scenes[index];
  const facts = [
    scene.start != null ? `starts ${fmtClockSecs(scene.start)}` : null,
    scene.duration != null ? `${Math.round(scene.duration)} s` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-black text-white/70">
        {scene.built === false ? (
          <span className="text-[13px]">Not built yet</span>
        ) : (
          <Still key={`${detail.row.slug}:${index}`} detail={detail} index={index} scene={scene} />
        )}
        <button type="button" aria-label="Previous scene" disabled={index === 0} onClick={() => setSelected(index - 1)} className={cn(ARROW, "left-2")}>
          <CaretLeft size={15} />
        </button>
        <button type="button" aria-label="Next scene" disabled={index === count - 1} onClick={() => setSelected(index + 1)} className={cn(ARROW, "right-2")}>
          <CaretRight size={15} />
        </button>
      </div>
      <div role="group" aria-label="Scenes" className="flex flex-wrap gap-1.5">
        {detail.scenes.map((s, i) => (
          <button
            key={s.id ?? i}
            type="button"
            aria-pressed={i === index}
            aria-label={`Scene ${i + 1}${s.built === false ? ", not built yet" : ""}`}
            onClick={() => setSelected(i)}
            className={cn(
              "h-[26px] min-w-[30px] cursor-pointer rounded-full border px-2.5 text-[12.5px] font-medium tabular-nums transition-colors",
              i === index
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground/80 hover:bg-accent",
              i !== index && s.built === false && "border-dashed text-muted-foreground",
            )}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-display text-[15px] font-semibold">{scene.title ?? humanizeSlug(scene.id ?? scene.component)}</span>
          {facts.length > 0 && <span className="shrink-0 text-[12.5px] text-muted-foreground tabular-nums">{facts.join(" · ")}</span>}
        </div>
        <p data-selectable className="text-[13.5px] text-foreground/80">
          {scene.text ?? <span className="text-muted-foreground">No narration for this scene.</span>}
        </p>
      </div>
      <div>
        <Button size="sm" disabled={!playable || scene.start == null} onClick={() => onPlay(scene.start ?? 0)}>
          <Play weight="fill" />
          Play from this scene
        </Button>
      </div>
    </div>
  );
}
