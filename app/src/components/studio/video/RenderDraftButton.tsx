import { CircleNotch } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import type { VideoDetail } from "@/lib/studio/videos";
import { useRenderStore } from "@/stores/studio/renderStore";

/** The one button under the player of a video with no render yet: a quick
 *  draft, the first thing to watch. While it renders the button spins and the
 *  render bar beside it shows its progress. */
export function RenderDraftButton({ detail }: { detail: VideoDetail }) {
  const { dir, slug } = detail.row;
  const active = useRenderStore((s) => s.active[dir]);
  const start = useRenderStore((s) => s.start);
  return (
    <Button size="sm" className="gap-1.5" disabled={!!active} onClick={() => void start(dir, slug, "draft")}>
      {active && <CircleNotch size={13} className="animate-spin" />}
      Render draft
    </Button>
  );
}
