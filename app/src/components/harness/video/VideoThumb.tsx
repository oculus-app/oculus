import { useState } from "react";
import { FilmSlate } from "@phosphor-icons/react";

import { useStill } from "@/hooks/studio/useStill";
import { studioThumbnail } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";

/** A video's thumbnail (scene 0's still) in a small 16:9 box; the film glyph
 *  until scene 0 can be drawn, or with no video yet. A portrait video shows whole. */
export function VideoThumb({ slug, modified, className }: { slug: string | null; modified: number | null; className?: string }) {
  const still = useStill(slug ? `thumb:${slug}:${modified}` : null, () => studioThumbnail(slug ?? ""));
  const url = slug ? still.url : null;
  const [portrait, setPortrait] = useState(false);
  return (
    <span className={cn("flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface", className)}>
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) => setPortrait(e.currentTarget.naturalHeight > e.currentTarget.naturalWidth)}
          className={portrait ? "size-full bg-black object-contain" : "size-full object-cover"}
        />
      ) : (
        <FilmSlate size={16} weight="light" className="text-muted-foreground" />
      )}
    </span>
  );
}
