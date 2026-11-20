import { Check, CircleNotch, X } from "@phosphor-icons/react";

import { fmtAgo } from "@/lib/format/format";
import type { VideoStep } from "@/lib/studio/progress";
import { cn } from "@/lib/utils";

/** A step's mark: a filled check, the brand spinner, a red cross, or an
 *  empty ring still to come. */
function Mark({ state }: { state: VideoStep["state"] }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-[18px] items-center justify-center rounded-full border-[1.5px] bg-card",
        state === "done" && "border-transparent bg-success text-primary-foreground",
        state === "failed" && "border-transparent bg-destructive text-destructive-foreground",
        state === "active" && "border-brand",
        state === "pending" && "border-border",
      )}
    >
      {state === "done" ? (
        <Check size={11} weight="bold" />
      ) : state === "failed" ? (
        <X size={11} weight="bold" />
      ) : state === "active" ? (
        <CircleNotch size={11} className="animate-spin text-brand" />
      ) : null}
    </span>
  );
}

/** The card's progress timeline: Script, Scenes, Narration, Draft, Final,
 *  each with when it finished or what it is doing now. */
export function VideoProgress({ steps }: { steps: VideoStep[] }) {
  return (
    <ol aria-label="Progress" className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.name} className="relative grid grid-cols-[18px_1fr_auto] gap-x-2.5 pb-3.5 last:pb-0">
          {i < steps.length - 1 && <span aria-hidden className="absolute top-5 bottom-0.5 left-[8.5px] w-px bg-border" />}
          <Mark state={s.state} />
          <div className="min-w-0 text-[13px]">
            <div className={cn("font-medium", s.state === "pending" && "font-normal text-muted-foreground")}>{s.name}</div>
            <p className={cn("text-[12.5px] break-words text-muted-foreground", s.state === "failed" && "text-destructive")}>
              {s.note}
            </p>
          </div>
          {s.state === "done" && s.when != null && (
            <time className="text-xs whitespace-nowrap text-muted-foreground tabular-nums" dateTime={new Date(s.when * 1000).toISOString()}>
              {fmtAgo(s.when * 1000)}
            </time>
          )}
        </li>
      ))}
    </ol>
  );
}
