import { useState } from "react";
import { Check, Play, Stop, ThumbsUp, X } from "@phosphor-icons/react";

import type { useClipPlayer } from "@/components/settings/voice/useClipPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Pronunciation, PronunciationDecision } from "@/lib/studio/pronunciations";
import { cn } from "@/lib/utils";
import { Reading } from "./Reading";
import { SentenceWithWord } from "./SentenceWithWord";
import { SourceLine } from "./SourceLine";

type Which = "original" | "suggestion";

const CORRECT =
  "border-success/35 bg-success/8 text-success hover:bg-success/15 hover:text-success dark:border-success/35 dark:bg-success/10 dark:hover:bg-success/20";
const WRONG =
  "border-destructive/35 bg-destructive/8 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/35 dark:bg-destructive/10 dark:hover:bg-destructive/20";

/**
 * One suggested reading: the word and its reading, its sentence with the
 * word picked out, where it is said, the two word samples, and the three
 * verdicts (correct, fine, wrong). A row sent back as wrong keeps its samples
 * and shows the student's note instead of the verdicts, until the agent
 * suggests again. Buttons wait while a request runs; a failure shows on the
 * row.
 */
export function PronunciationRow({ item, player, onPlay, onDecide, onWrong }: {
  item: Pronunciation;
  player: ReturnType<typeof useClipPlayer>;
  onPlay: (which: Which) => void;
  onDecide: (decision: PronunciationDecision) => Promise<void>;
  onWrong: (note: string | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const wrong = item.status === "wrong";
  const sampleError = player.error?.key.startsWith(`${item.id}:`) ? player.error.message : null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      console.error("Pronunciation update failed", cause);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await onWrong(note.trim() || null);
      setAsking(false);
      setNote("");
    });

  const sample = (which: Which, label: string) => {
    const phase = player.phaseOf(`${item.id}:${which}`);
    return (
      <Button
        variant="outline"
        size="xs"
        className="w-[6.25rem]"
        disabled={busy}
        onClick={() => (phase === "idle" ? onPlay(which) : player.stop())}
      >
        {phase === "playing" ? <Stop weight="fill" /> : <Play weight="fill" />}
        {phase === "making" ? "Making…" : phase === "playing" ? "Stop" : label}
      </Button>
    );
  };

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className={cn("min-w-0 flex-1 space-y-1", wrong && "text-muted-foreground")}>
          <p className="text-[13px]">
            <span className={cn("font-medium", !wrong && "text-foreground")}>{item.word}</span>
            <span className="text-muted-foreground"> read as </span>
            <Reading chip={!wrong}>{item.reading}</Reading>
          </p>
          <p className="text-xs text-muted-foreground">
            <SentenceWithWord sentence={item.sentence} word={item.word} strong={!wrong} />
          </p>
          <SourceLine subject={item.subject} video={item.video} at={item.created} />
        </div>
        <div className="flex shrink-0 gap-1.5">
          {sample("original", "Original")}
          {sample("suggestion", "Suggestion")}
        </div>
      </div>

      {wrong ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Sent back to agent{item.note ? <>: “{item.note}”</> : ", with no note"}
        </p>
      ) : asking ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Input
            autoFocus
            value={note}
            disabled={busy}
            aria-label="How is it said? (optional)"
            placeholder="How is it said? (optional)"
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
              if (e.key === "Escape") setAsking(false);
            }}
            className="h-7 max-w-sm flex-1 text-xs"
          />
          <Button size="xs" disabled={busy} onClick={() => void send()}>
            Send
          </Button>
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => void run(() => onDecide("correct"))}
            className={CORRECT}
          >
            <Check weight="bold" />
            Suggestion correct
          </Button>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => void run(() => onDecide("fine"))}>
            <ThumbsUp />
            Pronunciation is fine
          </Button>
          <Button variant="outline" size="xs" disabled={busy} onClick={() => setAsking(true)} className={WRONG}>
            <X weight="bold" />
            Suggestion wrong
          </Button>
        </div>
      )}

      {error || sampleError ? (
        <p className="mt-2 text-[11px] leading-relaxed text-destructive" data-selectable>
          {error ?? sampleError}
        </p>
      ) : null}
    </li>
  );
}
