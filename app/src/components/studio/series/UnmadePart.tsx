import { useNavigate } from "react-router-dom";
import { Chat, CircleNotch, FilmSlate } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { useVideoProgress } from "@/hooks/studio/useVideoProgress";
import { chatHref } from "@/lib/harness";
import { partPageOffer, partStatus } from "@/lib/studio/seriesView";
import type { SeriesPart, StudioSeries } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";

/**
 * A part not made, in the black frame a render would fill: its number, its
 * question and Make this part, which opens a new chat for the part. While
 * that chat works the frame says what it is doing. Open the chat is offered
 * whenever the part has a chat, working or stopped; nothing opens on its own.
 */
export function UnmadePart({
  series,
  part,
  making,
  threadId,
  onMake,
}: {
  series: StudioSeries;
  part: SeriesPart;
  /** The parts being made (`partsBeingMade`). */
  making: readonly number[];
  /** The part's chat (`partThread`), if it has one. */
  threadId: number | null;
  onMake: (number: number) => void;
}) {
  const navigate = useNavigate();
  const offer = partPageOffer(part, making);
  const { progress } = useVideoProgress(part.video, threadId);
  const status = partStatus({ part, making: offer === "making", progress });
  const chat = threadId != null ? chatHref(threadId) : null;
  const openChat = chat && (
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
  );

  return (
    <div className="flex aspect-video max-h-[440px] w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-xl border border-border bg-black p-6 text-center text-white/80">
      {offer === "making" ? (
        <CircleNotch size={26} className="shrink-0 text-brand motion-safe:animate-spin" />
      ) : (
        <FilmSlate size={28} weight="light" className="shrink-0" />
      )}
      <p className="text-[12px] text-white/55 tabular-nums">
        Part {part.number}/{series.parts.length}
      </p>
      <p className="max-w-[28ch] font-display text-[21px] leading-[1.3] font-semibold tracking-[-0.01em] text-white">
        {offer === "making" ? `Making “${part.question}”` : part.question}
      </p>
      {offer === "making" ? (
        <>
          <p className={cn("mb-1.5 max-w-[46ch] text-[13px]", status.tone === "bad" ? "text-destructive" : "text-white/65")}>{status.label}</p>
          {openChat}
        </>
      ) : (
        <>
          <Button onClick={() => onMake(part.number)}>Make this part</Button>
          {openChat}
        </>
      )}
    </div>
  );
}
