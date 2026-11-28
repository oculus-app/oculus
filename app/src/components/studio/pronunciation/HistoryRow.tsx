import { useState } from "react";
import { ArrowCounterClockwise, ArrowRight } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { canRevert, KIND_LABEL } from "@/lib/studio/pronunciationView";
import { revertPronunciation, type HistoryEvent, type HistoryKind } from "@/lib/studio/pronunciations";
import { cn } from "@/lib/utils";
import { Reading } from "./Reading";
import { SourceLine } from "./SourceLine";

/** A kind's chip: green for a reading taken, red for one sent back or
 *  removed, brand for one written by hand, neutral otherwise. */
const KIND_TONE: Record<HistoryKind, string> = {
  accepted: "bg-success/10 text-success",
  kept: "bg-surface text-muted-foreground",
  wrong: "bg-destructive/10 text-destructive",
  added: "bg-brand-muted text-brand",
  edited: "bg-brand-muted text-brand",
  removed: "bg-destructive/10 text-destructive",
  reverted: "bg-surface text-muted-foreground",
};

/** Said where a video would be, for an event with none. */
const MANUAL: Record<HistoryKind, string> = {
  accepted: "Added by hand",
  kept: "Added by hand",
  wrong: "Added by hand",
  added: "Added by hand",
  edited: "Edited by hand",
  removed: "Removed by hand",
  reverted: "Reverted in History",
};

/**
 * One decision or lexicon change: the word, its kind, the value before
 * (struck) and after, the student's note on one sent back, where it came
 * from and when, and Revert while the kind can be undone and has not been.
 * A refused revert says why on the row.
 */
export function HistoryRow({ event, onReverted }: { event: HistoryEvent; onReverted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrong = event.kind === "wrong";

  const revert = async () => {
    setBusy(true);
    setError(null);
    try {
      await revertPronunciation(event.id);
      onReverted();
    } catch (cause) {
      console.error("Pronunciation revert failed", cause);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const before = wrong ? event.reading : event.previous;
  const after = wrong ? null : event.reading;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-medium text-foreground">{event.word}</span>
            <span className={cn("rounded-full px-1.5 py-px text-[11px] font-medium", KIND_TONE[event.kind])}>
              {KIND_LABEL[event.kind]}
            </span>
            {before && <Reading className="text-muted-foreground line-through">{before}</Reading>}
            {before && after && <ArrowRight size={11} className="shrink-0 text-muted-foreground" />}
            {after && <Reading chip>{after}</Reading>}
          </div>
          {wrong && (
            <p className="text-xs text-muted-foreground">
              {event.note ? <>“{event.note}”</> : "No note"}
            </p>
          )}
          <SourceLine subject={event.subject} video={event.video} at={event.at} manual={MANUAL[event.kind]} />
        </div>
        {canRevert(event) ? (
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => void revert()}>
            <ArrowCounterClockwise />
            Revert
          </Button>
        ) : event.reverted ? (
          <span className="pt-1 text-[11px] text-muted-foreground">Reverted</span>
        ) : null}
      </div>
      {error && (
        <p className="mt-2 text-[11px] leading-relaxed text-destructive" data-selectable>
          {error}
        </p>
      )}
    </li>
  );
}
