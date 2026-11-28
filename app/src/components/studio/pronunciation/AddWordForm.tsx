import { useEffect, useState } from "react";
import { Play, Stop } from "@phosphor-icons/react";

import type { useClipPlayer } from "@/components/settings/voice/useClipPlayer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkLexiconReading, lexiconSample, setLexiconEntry, type LexiconEntry } from "@/lib/studio/lexicon";
import type { LibraryFilter } from "@/lib/studio/pronunciationView";
import { LibraryPicker } from "./LibraryPicker";
import { Reading } from "./Reading";

/** How long typing rests before the reading is checked. */
const CHECK_DELAY_MS = 300;
const SAMPLE_KEY = "add";

type Check = { phonemes: string } | { error: string } | null;

/** The reading's phonemes or why it does not check, `CHECK_DELAY_MS` after
 *  the last keystroke; null while either field is blank. */
function useReadingCheck(word: string, reading: string): Check {
  const [check, setCheck] = useState<Check>(null);
  useEffect(() => {
    const w = word.trim();
    const r = reading.trim();
    if (!w || !r) {
      setCheck(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      checkLexiconReading(w, r)
        .then((phonemes) => live && setCheck({ phonemes }))
        .catch((cause) => live && setCheck({ error: String(cause) }));
    }, CHECK_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [word, reading]);
  return check;
}

/**
 * Add word: a word, its reading (a respelling or `/phonemes/`) and the
 * lexicon it goes in, with the phonemes the reading resolves to shown as
 * it is typed (`studio_lexicon_check`) and a sample of the word read that
 * way. A refused save says why under the fields.
 */
export function AddWordForm({ codes, initial, player, onSaved, onCancel }: {
  codes: readonly string[];
  /** The lexicon chosen at first. */
  initial: "global" | { code: string };
  player: ReturnType<typeof useClipPlayer>;
  onSaved: (entry: LexiconEntry) => void;
  onCancel: () => void;
}) {
  const [word, setWord] = useState("");
  const [reading, setReading] = useState("");
  const [target, setTarget] = useState<LibraryFilter>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useReadingCheck(word, reading);
  const subject = typeof target === "object" ? target.code : null;
  const phase = player.phaseOf(SAMPLE_KEY);
  const sampleError = player.error?.key === SAMPLE_KEY ? player.error.message : null;
  const ready = word.trim() !== "" && reading.trim() !== "";

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const entry = await setLexiconEntry(subject, word.trim(), reading.trim());
      if (player.current?.key === SAMPLE_KEY) player.stop();
      onSaved(entry);
    } catch (cause) {
      console.error("Lexicon save failed", cause);
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  };
  const play = () => {
    if (phase !== "idle") return player.stop();
    void player.play(SAMPLE_KEY, () => lexiconSample(subject, word.trim(), reading.trim()));
  };
  // Enter submits the form.
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };

  return (
    <form
      className="shrink-0 space-y-3 border-b border-border-subtle px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Word</span>
          <Input autoFocus value={word} disabled={busy} placeholder="Eigenvector" onChange={(e) => setWord(e.target.value)} onKeyDown={keys} />
        </label>
        <label className="flex min-w-[12rem] flex-[1.4] flex-col gap-1">
          <span className="text-[11px] font-medium text-muted-foreground">Reading (respelling or /phonemes/)</span>
          <Input
            value={reading}
            disabled={busy}
            placeholder="EYE-gen-vector"
            spellCheck={false}
            onChange={(e) => setReading(e.target.value)}
            onKeyDown={keys}
            className="font-mono"
          />
        </label>
        <div className="flex min-w-[9rem] flex-col gap-1 max-w-[12rem]">
          <span className="text-[11px] font-medium text-muted-foreground">Save to</span>
          <LibraryPicker codes={codes} value={target} onChange={setTarget} label="Save to" size="field" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px]">
          <Button type="button" variant="outline" size="xs" disabled={!ready || busy} onClick={play}>
            {phase === "playing" ? <Stop weight="fill" /> : <Play weight="fill" />}
            {phase === "making" ? "Making…" : phase === "playing" ? "Stop" : "Play"}
          </Button>
          {check && "phonemes" in check ? (
            <Reading className="text-muted-foreground">{check.phonemes}</Reading>
          ) : check && "error" in check ? (
            <span className="text-muted-foreground" data-selectable>
              {check.error}
            </span>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="xs" disabled={!ready || busy}>
            Save to lexicon
          </Button>
        </div>
      </div>
      {error || sampleError ? (
        <p className="text-[11px] leading-relaxed text-destructive" data-selectable>
          {error ?? sampleError}
        </p>
      ) : null}
    </form>
  );
}
