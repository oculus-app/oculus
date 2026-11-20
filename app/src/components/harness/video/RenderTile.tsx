import { memo, useCallback, useEffect, useState } from "react";
import { Play, X } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useVideoDetail } from "@/hooks/studio/useVideoDetail";
import type { HarnessItem } from "@/lib/harness";
import { fmtClockSecs } from "@/lib/lectures/media";
import { studioAction } from "@/lib/studio/activity";
import { openVideoBeside } from "@/lib/studio/openVideo";
import { videoSeconds } from "@/lib/studio/videos";
import { useVideosStore } from "@/stores/studio/videosStore";
import { InlineVideo, type PlayRequest } from "./InlineVideo";
import { VideoThumb } from "./VideoThumb";
import { useOneInlinePlayer } from "./useOneInlinePlayer";

/**
 * A finished `oculus studio render`, drawn under its run's fold: the video's
 * thumbnail, "Rendered draft · 1:42" and Play, which grows the player in the
 * tile. It plays that preset's file as it is now; a later render of the same
 * preset replaces it.
 */
export const RenderTile = memo(function RenderTile({ item }: { item: HarnessItem }) {
  const action = studioAction(item);
  const slug = action?.slug ?? "";
  const { detail, reload } = useVideoDetail(slug);
  // The folder changed (a later render, an edit): its files are read again.
  const modified = useVideosStore((s) => s.videos.find((v) => v.slug === slug)?.modified);
  useEffect(() => {
    if (slug && modified != null) void reload();
  }, [slug, modified, reload]);
  const [play, setPlay] = useState<PlayRequest | null>(null);
  useOneInlinePlayer(play != null, useCallback(() => setPlay(null), []));
  if (!action || !slug) return null;

  const preset = action.preset;
  const file = detail?.renders.find((r) => r.preset === preset);
  const seconds = detail ? videoSeconds(detail) : null;
  const facts = [
    seconds != null ? fmtClockSecs(seconds) : null,
    detail ? `${detail.width}×${detail.height}` : null,
  ].filter(Boolean);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-2">
        <VideoThumb slug={slug} modified={file?.modified ?? null} className="w-[78px]" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium">Rendered {preset}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {file ? facts.join(" · ") : detail ? "This render is no longer in the video's folder" : "\u00a0"}
          </span>
        </div>
        {file && (
          <Button size="sm" variant={play ? "ghost" : "outline"} onClick={() => setPlay((p) => (p ? null : { at: 0, n: 1 }))}>
            {play ? <X /> : <Play weight="fill" />}
            {play ? "Close" : "Play"}
          </Button>
        )}
      </div>
      {play && detail && file && (
        <div className="border-t border-border-subtle p-3">
          <InlineVideo detail={detail} request={play} preset={preset} onOpenBeside={() => openVideoBeside(slug, detail.row.title)} />
        </div>
      )}
    </div>
  );
});
