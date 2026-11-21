import { CircleNotch } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { fmtClockSecs } from "@/lib/lectures/media";
import { madePartCount } from "@/lib/studio/series";
import { partRowKind, type PartRowKind } from "@/lib/studio/seriesView";
import type { SeriesPart, StudioSeries } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";

/** What a row does when pressed; null leaves it inert. */
export interface PartRowAction {
  label: string;
  onClick: () => void;
  /** The route ⌘-click opens in a new tab. */
  href?: string;
}

/**
 * A series' parts in order, the same picture on the video page and in the
 * chat card: the number, title and question, then a made part's length, the
 * part being made, or Make this part on the next part not made. Sized to
 * its content (at most seven parts), never a scroller. What a row does is
 * the caller's (`action`).
 */
export function PartsOutline({
  series,
  current,
  currentLabel,
  making,
  sending,
  error,
  onMake,
  action,
  compact = false,
}: {
  series: StudioSeries;
  /** The lit row: the part on screen. */
  current: number | null;
  /** Said on the lit row when it is made: "Watching", "Playing". */
  currentLabel?: string | null;
  making: number | null;
  sending: boolean;
  /** The last request's failure, under the next part not made. */
  error: string | null;
  onMake: (number: number) => void;
  action: (part: SeriesPart) => PartRowAction | null;
  /** The chat card's smaller heading and rows. */
  compact?: boolean;
}) {
  return (
    <section aria-label="Parts">
      <div className={cn("flex items-baseline gap-2 pl-0.5", compact ? "pb-1.5" : "pb-2")}>
        <h2 className={compact ? "font-sans text-[13px] font-medium" : "font-display text-[15px] font-semibold"}>Parts</h2>
        <span className="text-[12.5px] text-muted-foreground tabular-nums">
          {madePartCount(series)}/{series.parts.length}
        </span>
      </div>
      <ol className="flex flex-col gap-0.5">
        {series.parts.map((part) => (
          <PartRow
            key={part.number}
            part={part}
            kind={partRowKind(series, part, making)}
            lit={part.number === current}
            currentLabel={currentLabel}
            sending={sending}
            error={error}
            onMake={onMake}
            action={action(part)}
            compact={compact}
          />
        ))}
      </ol>
    </section>
  );
}

function PartRow({
  part,
  kind,
  lit,
  currentLabel,
  sending,
  error,
  onMake,
  action,
  compact,
}: {
  part: SeriesPart;
  kind: PartRowKind;
  lit: boolean;
  currentLabel?: string | null;
  sending: boolean;
  error: string | null;
  onMake: (number: number) => void;
  action: PartRowAction | null;
  compact: boolean;
}) {
  const seconds = part.video?.seconds ?? null;
  return (
    <li
      aria-current={lit || undefined}
      className={cn(
        "relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg",
        compact ? "min-h-[46px] px-2 py-1.5" : "min-h-[52px] px-2.5 py-2",
        lit && "bg-brand-muted",
      )}
    >
      {/* The whole row is the press; its content sits above it and lets
          pointer events through, all but the Make button. */}
      {action && (
        <button
          type="button"
          aria-label={action.label}
          data-tab-href={action.href}
          onClick={action.onClick}
          className={cn(
            "absolute inset-0 cursor-pointer rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            !lit && "hover:bg-accent",
          )}
        />
      )}
      <Mark number={part.number} made={part.made} lit={lit} />
      <span className="pointer-events-none relative flex min-w-0 flex-col">
        <span className={cn("truncate text-[13px] text-foreground", part.made ? "font-medium" : "font-normal")}>{part.title}</span>
        <span className="truncate text-[12.5px] text-muted-foreground">{part.question}</span>
        {kind === "make" && error && <span className="text-[12px] leading-snug text-destructive">{error}</span>}
      </span>
      <span className="pointer-events-none relative flex items-center">
        {kind === "made" ? (
          <span className="flex items-center gap-2 text-[12px] whitespace-nowrap text-muted-foreground tabular-nums">
            {lit && currentLabel && <span className="font-medium text-brand">{currentLabel}</span>}
            {seconds != null && fmtClockSecs(seconds)}
          </span>
        ) : kind === "making" ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap text-brand">
            <CircleNotch size={12} className="shrink-0 motion-safe:animate-spin" />
            Making…
          </span>
        ) : kind === "make" ? (
          <Button size="sm" className="pointer-events-auto" disabled={sending} onClick={() => onMake(part.number)}>
            Make this part
          </Button>
        ) : null}
      </span>
    </li>
  );
}

/** The part's number in a ring: filled when lit and made, dashed while not made. */
function Mark({ number, made, lit }: { number: number; made: boolean; lit: boolean }) {
  return (
    <span
      className={cn(
        "pointer-events-none relative flex size-[22px] items-center justify-center rounded-full border text-[11.5px] font-medium tabular-nums",
        made
          ? lit
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground"
          : lit
            ? "border-dashed border-brand text-brand"
            : "border-dashed border-border text-muted-foreground",
      )}
    >
      {number}
    </span>
  );
}
