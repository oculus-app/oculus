import { useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Books, Check, FilmSlate, Play, Stop, ThumbsUp, X } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSubjects } from "@/hooks/data/useSubjects";
import { displayCode, humanizeSlug } from "@/lib/format/format";
import type { Pronunciation, PronunciationDecision } from "@/lib/studio/pronunciations";
import { videoHref } from "@/lib/studio/routes";
import { cn } from "@/lib/utils";
import { useTabStore } from "@/stores/shell/tabStore";
import { useVideosStore } from "@/stores/studio/videosStore";
import type { useClipPlayer } from "../useClipPlayer";
import { SentenceWithWord } from "./SentenceWithWord";

type Which = "original" | "suggestion";

/**
 * One suggested reading: the word and the reading, its sentence with the
 * word picked out, where it is said (with clickable subject and video links),
 * the two word samples, and the three verdicts (correct, fine, wrong). A row
 * sent back as wrong keeps its samples and shows the student's note instead
 * of the verdicts, until the agent suggests again. Buttons wait while a
 * request runs; a failure shows on the row.
 */
export function PronunciationRow({ item, player, onPlay, onDecide, onWrong }: {
  item: Pronunciation;
  player: ReturnType<typeof useClipPlayer>;
  onPlay: (which: Which) => void;
  onDecide: (decision: PronunciationDecision) => Promise<void>;
  onWrong: (note: string | null) => Promise<void>;
}) {
  const navigate = useNavigate();
  const { subjects } = useSubjects();
  const videoRow = useVideosStore((s) => s.videos.find((v) => v.slug === item.video));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const wrong = item.status === "wrong";
  const sampleError = player.error?.key.startsWith(`${item.id}:`) ? player.error.message : null;

  const subjectMatch = item.subject
    ? (() => {
        const matches = subjects.filter((s) => displayCode(s.code) === item.subject);
        return matches.find((s) => s.is_current) ?? matches[0] ?? null;
      })()
    : null;
  const subjectHref = subjectMatch ? `/subjects/${subjectMatch.id}` : undefined;
  const videoTitle = videoRow?.title ?? humanizeSlug(item.video);
  const studioHref = videoHref(item.video, videoTitle);

  const openRoute = (href: string, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) useTabStore.getState().addTab(href);
    else navigate(href);
  };
  const middleOpen = (href: string, e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    useTabStore.getState().addTab(href);
  };

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
        className="w-[6.75rem]"
        disabled={busy}
        onClick={() => (phase === "idle" ? onPlay(which) : player.stop())}
      >
        {phase === "playing" ? <Stop size={12} weight="fill" /> : <Play size={12} weight="fill" />}
        {phase === "making" ? "Making…" : label}
      </Button>
    );
  };

  return (
    <li className="py-3">
      <div className="settings-row flex items-start justify-between gap-4">
        <div className={cn("min-w-0", wrong && "text-muted-foreground")}>
          <p className="text-[13px]">
            <span className={cn("font-medium", !wrong && "text-foreground")}>{item.word}</span>
            <span className="text-muted-foreground"> read as </span>
            <span className={cn(!wrong && "text-foreground")}>{item.reading}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <SentenceWithWord sentence={item.sentence} word={item.word} strong={!wrong} />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
            {item.subject ? (
              subjectHref ? (
                <button
                  type="button"
                  data-tab-href={subjectHref}
                  onClick={(e) => openRoute(subjectHref, e)}
                  onAuxClick={(e) => middleOpen(subjectHref, e)}
                  className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground hover:underline"
                >
                  <SubjectIcon code={subjectMatch?.code ?? item.subject} size={12} className="shrink-0" />
                  <span>{displayCode(item.subject)}</span>
                </button>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <SubjectIcon code={item.subject} size={12} className="shrink-0" />
                  <span>{displayCode(item.subject)}</span>
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1">
                <Books size={12} className="shrink-0" />
                <span>Library</span>
              </span>
            )}
            <span aria-hidden>·</span>
            <button
              type="button"
              data-tab-href={studioHref}
              onClick={(e) => openRoute(studioHref, e)}
              onAuxClick={(e) => middleOpen(studioHref, e)}
              className="inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground hover:underline"
            >
              <FilmSlate size={12} className="shrink-0" />
              <span>{videoTitle}</span>
            </button>
          </div>
        </div>
        <div className="settings-actions flex shrink-0 gap-1.5">
          {sample("original", "Original")}
          {sample("suggestion", "Suggestion")}
        </div>
      </div>

      {wrong ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Sent back to the agent{item.note ? <>: “{item.note}”</> : ", with no note"}
        </p>
      ) : asking ? (
        <div className="mt-2.5">
          <p className="text-[11px] text-muted-foreground">How is it said? (optional)</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Input
              autoFocus
              value={note}
              disabled={busy}
              placeholder="NESS-ter-off, stress on the first part"
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send();
                if (e.key === "Escape") setAsking(false);
              }}
            />
            <Button size="xs" disabled={busy} onClick={() => void send()}>
              Send
            </Button>
            <Button variant="ghost" size="xs" disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => void run(() => onDecide("correct"))}
            className="border-success/35 bg-success/8 text-success hover:bg-success/15 hover:text-success dark:border-success/35 dark:bg-success/10 dark:hover:bg-success/20"
          >
            <Check size={12} weight="bold" />
            Suggestion correct
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => void run(() => onDecide("fine"))}
          >
            <ThumbsUp size={12} />
            Pronunciation is fine
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            onClick={() => setAsking(true)}
            className="border-destructive/35 bg-destructive/8 text-destructive hover:bg-destructive/15 hover:text-destructive dark:border-destructive/35 dark:bg-destructive/10 dark:hover:bg-destructive/20"
          >
            <X size={12} weight="bold" />
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
