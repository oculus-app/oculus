import type { ReactNode } from "react";

import { NarrateError, RenderBar, RenderError } from "@/components/studio/video/RenderBar";
import { VideoDock, readVideoDockTab } from "@/components/studio/video/VideoDock";
import { VideoFacts } from "@/components/studio/video/VideoFacts";
import { VideoPlayer } from "@/components/studio/video/VideoPlayer";
import { useExportStatusReads } from "@/hooks/studio/useExportStatus";
import { useStoredState } from "@/hooks/ui/useStoredState";
import type { VideoPlayback } from "@/hooks/studio/useVideoPlayback";
import type { VideoDetail } from "@/lib/studio/videos";

const TAB_KEY = "oculus-studio-video-dock-tab";

/**
 * The detail page's video: the player with the Script and Scenes in its dock,
 * and under it one row, the facts (the theme and voice as pickers) at its
 * start and the render bar and `actions` (Render draft or Export) at its end.
 * Folding the dock (its button, T or its ×) leaves the picture the whole
 * width. It says when the export statuses the row and Export share are read.
 */
export function VideoDetailStage({
  detail,
  playback,
  running,
  onChanged,
  actions,
}: {
  detail: VideoDetail;
  playback: VideoPlayback;
  /** The video's thread is running a turn. */
  running: boolean;
  /** Re-reads the video after a picker changes it. */
  onChanged: () => void;
  actions?: ReactNode;
}) {
  const [tab, setTab] = useStoredState(TAB_KEY, readVideoDockTab);
  useExportStatusReads(detail.row.dir, detail.row.modified, running);
  const { player, current, src } = playback;
  const { dock, size, resizing, startDockDrag } = player.dock;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <VideoPlayer
        playback={playback}
        dockLabel={`${player.dockOpen ? "Hide" : "Show"} ${tab} (T)`}
        dock={
          <VideoDock
            detail={detail}
            tab={tab}
            onTabChange={setTab}
            current={current}
            seekable={!!src}
            onSeek={player.seek}
            dock={dock}
            size={size}
            open={player.dockOpen}
            resizing={resizing}
            onClose={player.closeDock}
            onHeaderPointerDown={startDockDrag}
            following={player.following}
            onScrollAway={player.onScrollAway}
            onBackToLive={player.onBackToLive}
          />
        }
      />
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
          {/* Sized to the pills, so a longer note beside them wraps the end
              group under them rather than reflowing the facts. */}
          <div className="min-w-0 flex-[0_1_auto]">
            <VideoFacts detail={detail} running={running} onChanged={onChanged} />
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <RenderBar detail={detail} playback={playback} running={running} />
            {actions}
          </div>
        </div>
        <RenderError dir={detail.row.dir} />
        <NarrateError dir={detail.row.dir} />
      </div>
    </div>
  );
}
