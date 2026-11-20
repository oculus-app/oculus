import { CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";

import type { VideoProgress } from "@/lib/studio/progress";
import { cn } from "@/lib/utils";

/** The video's one status line: a spinner while the agent works, a check
 *  once a render is ready, red when a step failed. */
export function VideoStatus({ progress, suffix, className }: { progress: VideoProgress; suffix?: string | null; className?: string }) {
  const { tone, label } = progress;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[12.5px] tabular-nums",
        tone === "bad" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {tone === "busy" ? (
        <CircleNotch size={12} className="shrink-0 animate-spin text-brand" />
      ) : tone === "ok" ? (
        <CheckCircle size={13} weight="fill" className="shrink-0 text-success" />
      ) : tone === "bad" ? (
        <WarningCircle size={13} weight="fill" className="shrink-0" />
      ) : null}
      <span className="truncate">
        {label}
        {suffix && ` · ${suffix}`}
      </span>
    </span>
  );
}
