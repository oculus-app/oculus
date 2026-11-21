import { useStill } from "@/hooks/studio/useStill";
import { studioThumbnail, type SeriesPart, type VideoRow } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";

/** Three rows of three fit the smallest frame; past that the last slot counts the rest. */
const MAX_SLOTS = 9;

const SLOT = "aspect-video overflow-hidden rounded-[5px] border";

/** A folder card's picture: its parts in order, a made one as its still and
 *  the rest as empty dashed slots. */
export function FolderSlots({ parts }: { parts: SeriesPart[] }) {
  const ordered = [...parts].sort((a, b) => a.number - b.number);
  const overflow = ordered.length > MAX_SLOTS;
  const shown = overflow ? ordered.slice(0, MAX_SLOTS - 1) : ordered;
  return (
    <span className="grid size-full grid-cols-3 content-center gap-1.5 px-3.5">
      {shown.map((p) =>
        p.made && p.video ? (
          <MadeSlot key={p.slug} video={p.video} />
        ) : (
          <span key={p.slug} className={cn(SLOT, "border-dashed border-input bg-card")} />
        ),
      )}
      {overflow && (
        <span className={cn(SLOT, "flex items-center justify-center border-dashed border-input bg-card text-[11px] text-muted-foreground tabular-nums")}>
          +{ordered.length - shown.length}
        </span>
      )}
    </span>
  );
}

function MadeSlot({ video }: { video: VideoRow }) {
  // The same key as the video's own card, so both share one still.
  const still = useStill(`thumb:${video.slug}:${video.modified}`, () => studioThumbnail(video.slug));
  return (
    <span className={cn(SLOT, "border-border bg-secondary")}>
      {still.url && <img src={still.url} alt="" draggable={false} className="size-full object-cover" />}
    </span>
  );
}
