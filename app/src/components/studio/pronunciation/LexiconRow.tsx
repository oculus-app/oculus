import { useState } from "react";
import { PencilSimple, Play, Stop, Trash } from "@phosphor-icons/react";

import type { useClipPlayer } from "@/components/settings/voice/useClipPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { lexiconSample, removeLexiconEntry, setLexiconEntry, type LexiconEntry } from "@/lib/studio/lexicon";
import { LibraryLabel } from "./LibraryLabel";
import { Reading } from "./Reading";

/** The Lexicon table's columns, shared by its header. */
export const LEXICON_COLS =
  "grid grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.2fr)_minmax(8rem,1.2fr)_minmax(7rem,9rem)_5.5rem] items-center gap-3 px-5";

export const entryKey = (e: Pick<LexiconEntry, "subject" | "word">) => `${e.subject ?? "~global"}/${e.word}`;

function RowAction({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One saved word: its reading, the phonemes it resolves to (or why it does
 * not check, in red), whose lexicon it is in, and play, edit in place and
 * remove. Remove asks nothing: History's Revert puts it back. While editing,
 * play reads the draft.
 */
export function LexiconRow({ entry, player, onChanged }: {
  entry: LexiconEntry;
  player: ReturnType<typeof useClipPlayer>;
  /** After a write: the page reads the lexicons and the history again. */
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.reading);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `lex:${entryKey(entry)}`;
  const phase = player.phaseOf(key);
  const sampleError = player.error?.key === key ? player.error.message : null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (cause) {
      console.error("Lexicon update failed", cause);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const reading = draft.trim();
    if (reading === entry.reading) {
      setEditing(false);
      return;
    }
    void run(async () => {
      await setLexiconEntry(entry.subject, entry.word, reading);
      setEditing(false);
    });
  };
  const cancel = () => {
    setEditing(false);
    setDraft(entry.reading);
    setError(null);
  };
  const play = () => {
    if (phase !== "idle") return player.stop();
    const reading = editing ? draft.trim() : entry.reading;
    if (reading) void player.play(key, () => lexiconSample(entry.subject, entry.word, reading));
  };

  return (
    <div className="py-2">
      <div className={LEXICON_COLS}>
        <span className="min-w-0 truncate text-[13px] font-medium text-foreground" title={entry.word}>
          {entry.word}
        </span>
        <span className="min-w-0">
          {editing ? (
            <Input
              autoFocus
              value={draft}
              disabled={busy}
              aria-label={`Reading for ${entry.word}`}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") cancel();
              }}
              className="h-7 font-mono text-xs"
            />
          ) : (
            <Reading chip>{entry.reading}</Reading>
          )}
        </span>
        <span className="min-w-0">
          {entry.error ? (
            <span className="text-[11px] leading-snug text-destructive" data-selectable>
              {entry.error}
            </span>
          ) : entry.phonemes ? (
            <Reading className="text-muted-foreground">{entry.phonemes}</Reading>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
          <LibraryLabel subject={entry.subject} />
          {entry.overrides && <span className="text-[11px] text-brand">overrides Global</span>}
        </span>
        <span className="flex items-center justify-end gap-0.5">
          {editing ? (
            <>
              <Button size="xs" disabled={busy || !draft.trim()} onClick={save}>
                Save
              </Button>
              <Button variant="ghost" size="xs" disabled={busy} onClick={cancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <RowAction label={phase === "playing" ? "Stop" : phase === "making" ? "Making…" : "Play"} onClick={play}>
                {phase === "idle" ? <Play weight="fill" /> : <Stop weight="fill" />}
              </RowAction>
              <RowAction
                label="Edit reading"
                disabled={busy}
                onClick={() => {
                  setDraft(entry.reading);
                  setEditing(true);
                }}
              >
                <PencilSimple />
              </RowAction>
              <RowAction
                label="Remove"
                disabled={busy}
                onClick={() => void run(() => removeLexiconEntry(entry.subject, entry.word))}
              >
                <Trash />
              </RowAction>
            </>
          )}
        </span>
      </div>
      {error || sampleError ? (
        <p className="px-5 pt-1 text-[11px] leading-relaxed text-destructive" data-selectable>
          {error ?? sampleError}
        </p>
      ) : null}
    </div>
  );
}
