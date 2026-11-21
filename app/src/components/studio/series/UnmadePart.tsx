import { useNavigate } from "react-router-dom";
import { Chat, CircleNotch, FilmSlate } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVideoProgress } from "@/hooks/studio/useVideoProgress";
import { chatHref } from "@/lib/harness";
import { partPageOffer, partStatus } from "@/lib/studio/seriesView";
import type { SeriesPart, StudioSeries } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";

/**
 * A part not made, in the black frame a render would fill: its number, its
 * question and Make this part. Once asked for, the frame says what the
 * series' thread is doing and offers Open the chat; nothing opens on its own.
 */
export function UnmadePart({
  series,
  part,
  making,
  sending,
  running,
  error,
  onMake,
}: {
  series: StudioSeries;
  part: SeriesPart;
  making: number | null;
  sending: boolean;
  running: boolean;
  error: string | null;
  onMake: (number: number) => void;
}) {
  const navigate = useNavigate();
  const offer = partPageOffer(part, making);
  const { progress } = useVideoProgress(part.video, series.threadId);
  const status = partStatus({ part, making: offer.kind === "making", sending, running, progress });
  const chat = series.threadId != null ? chatHref(series.threadId) : null;

  return (
    <div className="flex aspect-video max-h-[440px] w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-xl border border-border bg-black p-6 text-center text-white/80">
      {offer.kind === "making" ? (
        <CircleNotch size={26} className="shrink-0 text-brand motion-safe:animate-spin" />
      ) : (
        <FilmSlate size={28} weight="light" className="shrink-0" />
      )}
      <p className="text-[12px] text-white/55 tabular-nums">
        Part {part.number}/{series.parts.length}
      </p>
      <p className="max-w-[28ch] font-display text-[21px] leading-[1.3] font-semibold tracking-[-0.01em] text-white">
        {offer.kind === "making" ? `Making “${part.question}”` : part.question}
      </p>
      {offer.kind === "making" ? (
        <>
          <p className={cn("mb-1.5 max-w-[46ch] text-[13px]", status.tone === "bad" ? "text-destructive" : "text-white/65")}>{status.label}</p>
          {chat && (
            <Button
              variant="ghost"
              size="sm"
              data-tab-href={chat}
              onClick={() => navigate(chat)}
              className="border border-white/25 bg-white/[0.08] text-white hover:bg-white/15 hover:text-white dark:hover:bg-white/15"
            >
              <Chat size={14} />
              Open the chat
            </Button>
          )}
        </>
      ) : offer.kind === "busy" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex rounded-full outline-none">
              <Button disabled>Make this part</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{offer.reason}</TooltipContent>
        </Tooltip>
      ) : (
        <Button disabled={sending} onClick={() => onMake(part.number)}>
          Make this part
        </Button>
      )}
      {offer.kind !== "making" && error && <p className="max-w-[46ch] text-[12.5px] leading-snug text-destructive">{error}</p>}
    </div>
  );
}
