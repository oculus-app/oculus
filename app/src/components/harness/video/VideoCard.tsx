import { useCallback, useState, type ReactNode } from "react";
import { CaretDown, Eye, Play, SidebarSimple, X } from "@phosphor-icons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThreadVideo } from "@/hooks/studio/useThreadVideo";
import { fmtClockSecs } from "@/lib/lectures/media";
import { playableRenders } from "@/lib/studio/exports";
import { openVideoBeside } from "@/lib/studio/openVideo";
import { videoHref } from "@/lib/studio/routes";
import { videoSeconds } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";
import { CardPlayer, type CardPlay } from "./CardPlayer";
import { SeriesCardParts } from "./SeriesCardParts";
import { Storyboard } from "./Storyboard";
import { VideoProgress } from "./VideoProgress";
import { VideoStatus } from "./VideoStatus";
import { VideoThumb } from "./VideoThumb";
import { useOneInlinePlayer } from "./useOneInlinePlayer";

function CardButton({
  label,
  open,
  onClick,
  href,
  children,
}: {
  label: string;
  open?: boolean;
  onClick: () => void;
  /** The route ⌘-click opens in a new tab. */
  href?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          data-tab-href={href}
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
 * timeline, and Play grows the player in place. The title, and the expand
 * buttons on the card and its player, open the video's page beside the chat
 * (⌘-click: a new tab). A thread making a series takes the series' title,
 * follows one part (`useThreadVideo`) and always shows the Parts outline,
 * whose made rows play in this card. Drawn by the app from the thread's
 * link, the folders and `renderStore`; the agent never writes it.
 */
export function VideoCard({ threadId }: { threadId: number }) {
  const { row, detail, progress, status, series } = useThreadVideo(threadId);
  const [timeline, setTimeline] = useState(false);
  const [board, setBoard] = useState(false);
  const [play, setPlay] = useState<CardPlay | null>(null);
  useOneInlinePlayer(play != null, useCallback(() => setPlay(null), []));
  if (!row && !series) return null;

  const playable = !!detail && playableRenders(detail.renders).length > 0;
  const seconds = detail ? videoSeconds(detail) : null;
  const ready = status.tone === "ok" && seconds != null ? fmtClockSecs(seconds) : null;
  const playFrom = (slug: string, at: number) => setPlay((p) => ({ slug, at, n: (p?.n ?? 0) + 1 }));
  // The card's own part, or for a series with no folder yet the part asked for.
  const page = row ?? series?.part ?? null;
  const title = series?.series.title ?? row?.title ?? "";
  const href = page ? videoHref(page.slug, page.title) : undefined;
  const beside = () => page && openVideoBeside(page.slug, page.title);

  return (
    <section aria-label={`Video: ${title}`} className="mb-4 overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="relative flex items-center gap-1 py-2 pr-2 pl-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-tab-href={href}
              onClick={beside}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left"
            >
              <VideoThumb slug={row?.slug ?? null} modified={detail?.row.modified ?? row?.modified ?? null} className="w-16" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-display text-[14px] font-semibold hover:underline">{title}</span>
                <VideoStatus progress={status} suffix={ready} />
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">Open beside the chat</TooltipContent>
        </Tooltip>
        {playable && row && (
          <CardButton label={play ? "Close the player" : "Play"} open={!!play} onClick={() => (play ? setPlay(null) : playFrom(row.slug, 0))}>
            {play ? <X size={15} /> : <Play size={15} weight="fill" />}
          </CardButton>
        )}
        <CardButton label="Storyboard" open={board} onClick={() => setBoard((b) => !b)}>
          <Eye size={16} />
        </CardButton>
        <CardButton label="Progress" open={timeline} onClick={() => setTimeline((t) => !t)}>
          <CaretDown size={16} className={cn("transition-transform will-change-transform", timeline && "rotate-180")} />
        </CardButton>
        <CardButton label="Open beside the chat" onClick={beside} href={href}>
          <SidebarSimple size={16} className="scale-x-[-1]" />
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
      {play && (
        <div className="border-t border-border-subtle p-3">
          <CardPlayer play={play} />
        </div>
      )}
      {timeline && (
        <div className="border-t border-border-subtle px-4 py-3.5">
          <VideoProgress steps={progress.steps} />
        </div>
      )}
      {board && detail && row && (
        <div className="border-t border-border-subtle p-4">
          <Storyboard detail={detail} playable={playable} onPlay={(at) => playFrom(row.slug, at)} />
        </div>
      )}
      {series && (
        <div className="border-t border-border-subtle px-3 pt-3 pb-2.5">
          <SeriesCardParts
            inSeries={series}
            playing={play ? play.slug : null}
            onPlay={(slug) => {
              if (play?.slug !== slug) playFrom(slug, 0);
            }}
          />
        </div>
      )}
    </section>
  );
}
