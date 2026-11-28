import { useCallback, useState, type ReactNode } from "react";
import { CaretDown, SidebarSimple, X } from "@phosphor-icons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useThreadVideo } from "@/hooks/studio/useThreadVideo";
import { fmtClockSecs } from "@/lib/lectures/media";
import { openVideoBeside } from "@/lib/studio/openVideo";
import { videoHref } from "@/lib/studio/routes";
import { videoSeconds } from "@/lib/studio/videos";
import { Fold } from "@/components/ui/Fold";
import { cn } from "@/lib/utils";
import { CardPlayer, type CardPlay } from "./CardPlayer";
import type { PlayRequest } from "./InlineVideo";
import { SeriesCardParts } from "./SeriesCardParts";
import { VideoProgress, type RenderStep } from "./VideoProgress";
import { VideoStatus } from "./VideoStatus";
import { VideoThumb } from "./VideoThumb";
import { useOneInlinePlayer } from "./useOneInlinePlayer";

type CardPlayback =
  | { kind: "step"; step: RenderStep; request: PlayRequest }
  | { kind: "part"; play: CardPlay };

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
 * The video a thread is making, a row of its timeline under the work of the
 * last run that touched it (`buildRows`): thumbnail, title and one
 * status line; the chevron opens the progress steps where each step's own
 * output (script, storyboard scenes, narration timings whose rows play each
 * scene's clip, rendered draft or final player) sits flat under it. The title, and the expand buttons on the
 * card and its player, open the video's page beside the chat (⌘-click: a
 * new tab). A series part's chat takes the series' title, follows its own
 * part (`useThreadVideo`) and always shows the Parts outline, whose made
 * rows play in this card. Drawn by the app from the thread's link, the
 * folders and `renderStore`; the agent never writes it.
 */
export function VideoCard({ threadId }: { threadId: number }) {
  const { row, detail, progress, status, series } = useThreadVideo(threadId);
  const [timeline, setTimeline] = useState(false);
  const [play, setPlay] = useState<CardPlayback | null>(null);
  useOneInlinePlayer(play != null, useCallback(() => setPlay(null), []));
  if (!row && !series) return null;

  const hasDraft = !!detail && detail.renders.some((r) => r.preset === "draft");
  const hasFinal = !!detail && detail.renders.some((r) => r.preset === "final");
  const defaultRenderStep: RenderStep | null = hasFinal ? "Final" : hasDraft ? "Draft" : null;
  const seconds = detail ? videoSeconds(detail) : null;
  const ready = status.tone === "ok" && seconds != null ? fmtClockSecs(seconds) : null;

  const nextSeq = (prev: CardPlayback | null) =>
    (prev?.kind === "step" ? prev.request.n : prev?.kind === "part" ? prev.play.n : 0) + 1;

  const toggleTimeline = () => {
    setTimeline((open) => {
      if (open && play?.kind === "step") setPlay(null);
      return !open;
    });
  };

  const toggleRenderStep = (step: RenderStep) => {
    setPlay((prev) =>
      prev?.kind === "step" && prev.step === step
        ? null
        : { kind: "step", step, request: { at: 0, n: nextSeq(prev) } },
    );
  };

  const playAt = (at: number) => {
    if (!defaultRenderStep) return;
    setTimeline(true);
    setPlay((prev) => ({ kind: "step", step: defaultRenderStep, request: { at, n: nextSeq(prev) } }));
  };

  const playSeriesPart = (slug: string) => {
    if (slug === row?.slug && defaultRenderStep) {
      setTimeline(true);
      setPlay((prev) =>
        prev?.kind === "step" && prev.step === defaultRenderStep
          ? prev
          : { kind: "step", step: defaultRenderStep, request: { at: 0, n: nextSeq(prev) } },
      );
      return;
    }
    setPlay((prev) =>
      prev?.kind === "part" && prev.play.slug === slug
        ? prev
        : { kind: "part", play: { slug, at: 0, n: nextSeq(prev) } },
    );
  };

  // The card's own video, or for a part with no folder yet that part.
  const page = row ?? series?.part ?? null;
  const title = series?.series.title ?? row?.title ?? "";
  const href = page ? videoHref(page.slug, page.title) : undefined;
  const beside = () => page && openVideoBeside(page.slug, page.title);

  const activeRender =
    play?.kind === "step" && ((play.step === "Draft" && hasDraft) || (play.step === "Final" && hasFinal))
      ? { step: play.step, request: play.request }
      : null;

  const playingSlug = activeRender ? (row?.slug ?? null) : play?.kind === "part" ? play.play.slug : null;
  const playingPart =
    play?.kind === "part" ? (series?.series.parts.find((p) => p.slug === play.play.slug) ?? null) : null;

  return (
    <section
      aria-label={`Video: ${title}`}
      className="overflow-hidden rounded-[14px] border border-border bg-card will-change-transform"
    >
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
        <CardButton label={timeline ? "Hide details" : "Show details"} open={timeline} onClick={toggleTimeline}>
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
      <Fold open={timeline}>
        <div className="border-t border-border-subtle px-4 py-3.5">
          <VideoProgress
            steps={progress.steps}
            detail={detail}
            activeRender={activeRender}
            onToggleRender={toggleRenderStep}
            onPlayAt={playAt}
            onOpenBeside={beside}
          />
        </div>
      </Fold>
      {play?.kind === "part" && (
        <div className="border-t border-border-subtle p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium text-muted-foreground">
              {playingPart ? `Part ${playingPart.number} · ${playingPart.title}` : "Playing"}
            </span>
            <button
              type="button"
              aria-label="Close the player"
              onClick={() => setPlay(null)}
              className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          <CardPlayer play={play.play} />
        </div>
      )}
      {series && (
        <div className="border-t border-border-subtle px-3 pt-3 pb-2.5">
          <SeriesCardParts
            inSeries={series}
            playing={playingSlug}
            onPlay={playSeriesPart}
          />
        </div>
      )}
    </section>
  );
}
