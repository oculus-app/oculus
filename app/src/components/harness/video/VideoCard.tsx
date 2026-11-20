import { useState, type ReactNode } from "react";
import { CaretDown, Eye, Play, X } from "@phosphor-icons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThreadVideo } from "@/hooks/studio/useThreadVideo";
import { fmtClockSecs } from "@/lib/lectures/media";
import { playableRenders } from "@/lib/studio/exports";
import { videoSeconds } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";
import { InlineVideo, type PlayRequest } from "./InlineVideo";
import { Storyboard } from "./Storyboard";
import { VideoProgress } from "./VideoProgress";
import { VideoStatus } from "./VideoStatus";
import { VideoThumb } from "./VideoThumb";

function CardButton({
  label,
  open,
  onClick,
  children,
}: {
  label: string;
  open?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={onClick}
          className={cn(
            "flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
            open ? "bg-brand-muted text-brand" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The video a thread is making, above its timeline: thumbnail, title and one
 * status line; the eye opens the storyboard, the chevron the progress
 * timeline, and Play grows the player in place. Drawn by the app from the
 * thread's link, the video's folder and `renderStore`; the agent never
 * writes it. Nothing is drawn for a thread with no video.
 */
export function VideoCard({ threadId }: { threadId: number }) {
  const { row, detail, progress } = useThreadVideo(threadId);
  const [timeline, setTimeline] = useState(false);
  const [board, setBoard] = useState(false);
  const [play, setPlay] = useState<PlayRequest | null>(null);
  if (!row) return null;

  const playable = !!detail && playableRenders(detail.renders).length > 0;
  const seconds = detail ? videoSeconds(detail) : null;
  const ready = progress.tone === "ok" && seconds != null ? fmtClockSecs(seconds) : null;
  const playFrom = (at: number) => setPlay((p) => ({ at, n: (p?.n ?? 0) + 1 }));

  return (
    <section aria-label={`Video: ${row.title}`} className="mb-4 overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="relative flex items-center gap-1 py-2 pr-2 pl-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <VideoThumb slug={row.slug} modified={detail?.row.modified ?? row.modified} className="w-16" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-display text-[14px] font-semibold">{row.title}</span>
            <VideoStatus progress={progress} suffix={ready} />
          </div>
        </div>
        {playable && (
          <CardButton label={play ? "Close the player" : "Play"} open={!!play} onClick={() => (play ? setPlay(null) : playFrom(0))}>
            {play ? <X size={15} /> : <Play size={15} weight="fill" />}
          </CardButton>
        )}
        <CardButton label="Storyboard" open={board} onClick={() => setBoard((b) => !b)}>
          <Eye size={16} />
        </CardButton>
        <CardButton label="Progress" open={timeline} onClick={() => setTimeline((t) => !t)}>
          <CaretDown size={16} className={cn("transition-transform will-change-transform", timeline && "rotate-180")} />
        </CardButton>
        {(progress.fraction != null || progress.sweeping) && (
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5">
            {progress.sweeping ? (
              <span className="block size-full progress-sweep" />
            ) : (
              <span className="block h-full bg-brand transition-[width] duration-300" style={{ width: `${(progress.fraction ?? 0) * 100}%` }} />
            )}
          </span>
        )}
      </div>
      {play && detail && playable && (
        <div className="border-t border-border-subtle p-3">
          <InlineVideo detail={detail} request={play} />
        </div>
      )}
      {timeline && (
        <div className="border-t border-border-subtle px-4 py-3.5">
          <VideoProgress steps={progress.steps} />
        </div>
      )}
      {board && detail && (
        <div className="border-t border-border-subtle p-4">
          <Storyboard detail={detail} playable={playable} onPlay={playFrom} />
        </div>
      )}
    </section>
  );
}
