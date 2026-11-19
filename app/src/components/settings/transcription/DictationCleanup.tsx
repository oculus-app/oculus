import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentToggle, type SegmentOption } from "@/components/settings/appearance/SegmentToggle";
import { PackDownloadRow, packState } from "@/components/settings/voice/PackDownloadRow";
import { usePackDownload, type PackApi } from "@/components/settings/voice/usePackDownload";
import { isMac } from "@/lib/platform";
import {
  cancelS1Mini,
  dictationCleanupStatus,
  downloadS1Mini,
  onS1MiniProgress,
  removeS1Mini,
  type S1MiniStatus,
} from "@/lib/dictation/cleanup";
import { groqUsage, summarizeUsage, usageByRole, type UsageSummary } from "@/lib/dictation/groqUsage";
import type { CleanupChoice } from "@/lib/lectures/transcribe";
import { modelSize } from "./LocalWhisper";

/** `groq::MODEL` (`qwen/qwen3.8-27b`) as the page names it. */
const QWEN = "Qwen 3.8 27B";

const S1_MINI: PackApi<S1MiniStatus> = {
  name: "S1-mini",
  status: () => dictationCleanupStatus().then((status) => status.s1Mini),
  download: downloadS1Mini,
  cancel: cancelS1Mini,
  remove: removeS1Mini,
  onProgress: onS1MiniProgress,
};

const CHOICES: readonly SegmentOption<CleanupChoice>[] = [
  { value: "auto", label: "Automatic" },
  { value: "groq", label: "Groq" },
  { value: "s1Mini", label: "S1-mini" },
  { value: "off", label: "Off" },
];

/** What the chosen cleanup does now, by Rust's rule (`run` and
 *  `first_engine` in `transcribe/cleanup/mod.rs`): Automatic is Groq with a
 *  key, else S1-mini when it is downloaded and can run here; Groq and S1-mini
 *  alone need their own setup; Off inserts the transcript as heard. */
export function engineLine(
  choice: CleanupChoice | null,
  connected: boolean | null,
  s1: S1MiniStatus | null,
): { text: string; warn: boolean } {
  const blank = { text: "\u00a0", warn: false };
  if (choice === "off") return { text: "Off: dictation joins your draft as heard.", warn: false };
  if (choice === null || connected === null) return blank;
  const groq = `Groq's ${QWEN}, using your Groq key.`;
  if (choice === "groq") {
    return connected
      ? { text: `${groq} Nothing steps in if Groq fails.`, warn: false }
      : { text: "Not set up: add a Groq key, or choose another cleanup.", warn: true };
  }
  if (s1 === null) return blank;
  const s1Ready = s1.status === "present" && !s1.unavailable;
  if (choice === "s1Mini") {
    if (s1Ready) return { text: `${s1.label}, on this Mac. Dictation never goes to Groq.`, warn: false };
    return {
      text: s1.unavailable || !isMac
        ? `${s1.label} can't run here: choose another cleanup.`
        : `Not set up: download ${s1.label} below, or choose another cleanup.`,
      warn: true,
    };
  }
  if (connected) {
    return {
      text: `${groq}${s1Ready ? ` ${s1.label} steps in if Groq fails.` : ""}`,
      warn: false,
    };
  }
  if (s1Ready) return { text: `${s1.label}, on this Mac.`, warn: false };
  return {
    text: isMac
      ? `Not set up: add a Groq key, or download ${s1.label} below.`
      : "Not set up: add a Groq key.",
    warn: true,
  };
}

/** The Groq row's reading: "Today: 1,986 of 2,000 transcriptions · … left". */
export function usageText(summary: UsageSummary | null): string | null {
  if (!summary) return null;
  const window = summary.window === "today" ? "Today" : "This minute";
  return `${window}: ${summary.parts.join(" · ")} left`;
}

/** Groq's last reading of its allowance, from memory; never calls Groq. */
function useGroqUsage(): UsageSummary | null {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    groqUsage()
      .then(({ models }) => {
        if (!cancelled) setSummary(summarizeUsage(usageByRole(models)));
      })
      .catch((cause) => console.error("Groq usage read failed", cause));
    return () => {
      cancelled = true;
    };
  }, []);
  return summary;
}

/** S1-mini's row: what its absence means, and what deleting it does. */
function s1Notes(choice: CleanupChoice | null, connected: boolean | null) {
  if (choice === "s1Mini") {
    return {
      missing: "Dictation can't be tidied until this is downloaded.",
      deleted: "Dictation then can't be tidied until it is downloaded again from here or another cleanup is chosen.",
    };
  }
  if (choice === "auto" || choice === null) {
    return {
      missing: connected === false ? "Dictation can't be tidied until this is downloaded or a Groq key is added." : undefined,
      deleted: connected
        ? "Groq then tidies dictation with no fallback. It can be downloaded again from here."
        : "Dictation can't be tidied until it is downloaded again from here or a Groq key is added.",
    };
  }
  return { missing: undefined, deleted: "It can be downloaded again from here." };
}

/**
 * How dictated text is tidied before it joins the draft: the engine choice
 * (the `transcribe` row's `cleanup`), then Groq's Qwen on the page's Groq key
 * and S1-mini by Superwhisper downloaded like a Whisper model (macOS only).
 * Reads disk and keyd only; only Download goes online.
 */
export function DictationCleanup({ choice, onChoose, connected, onOpenGroq }: {
  /** The stored choice; null until the settings row is read. */
  choice: CleanupChoice | null;
  onChoose: (choice: CleanupChoice) => void;
  /** The page's Groq key state; null until the keychain has answered. */
  connected: boolean | null;
  onOpenGroq: () => void;
}) {
  const pack = usePackDownload(S1_MINI);
  const { status, download } = pack;
  const line = engineLine(choice, connected, status);
  const notes = s1Notes(choice, connected);
  const usage = useGroqUsage();
  const usageLine = connected ? usageText(usage) : null;
  // S1-mini runs on macOS only; elsewhere it is offered only while chosen.
  const options = isMac || choice === "s1Mini" ? CHOICES : CHOICES.filter((c) => c.value !== "s1Mini");

  return (
    <div className="mt-5">
      <p className="text-xs text-foreground">Dictation cleanup</p>
      <p className="text-[11px] text-muted-foreground">Tidies what you dictate before it joins your draft.</p>
      <div className="mt-2">
        <SegmentToggle label="Dictation cleanup engine" value={choice ?? "auto"} options={options} onChange={onChoose} />
      </div>
      <p className={line.warn ? "mt-1.5 text-[11px] text-warning" : "mt-1.5 text-[11px] text-muted-foreground"}>
        {line.text}
      </p>

      <ul
        aria-label="Dictation cleanup engines"
        className="mt-2 divide-y divide-border-subtle rounded-lg border border-border-subtle"
      >
        <li className="flex flex-wrap items-center gap-2 rounded-t-lg bg-card py-2 pr-2.5 pl-3 last:rounded-b-lg">
          <div className="min-w-0 basis-28 flex-1">
            <p className="text-xs text-foreground">Groq · {QWEN}</p>
            <p className="text-[11px] text-muted-foreground">
              {connected === null ? "\u00a0" : connected ? "Uses your Groq key" : "No key"}
            </p>
            {usageLine ? (
              <p className="truncate text-[11px] text-muted-foreground tabular-nums" title={usage?.detail}>
                {usageLine}
              </p>
            ) : null}
          </div>
          <Button variant="outline" size="xs" className="w-16 shrink-0" onClick={onOpenGroq}>
            {connected ? "Manage" : "Set up"}
          </Button>
        </li>
        {isMac ? (
          <li className="rounded-b-lg bg-card pr-2.5 pl-3">
            <PackDownloadRow
              name={status?.label ?? "S1-mini by Superwhisper"}
              detail={
                status
                  ? `${modelSize(status.bytes)} download · English only · Runs on this Mac · ${packState(status.status, download !== null)}`
                  : "\u00a0"
              }
              pack={pack}
              missing={notes.missing}
              deleteDescription={notes.deleted}
            />
            {status?.unavailable ? (
              <p className="-mt-1 pb-2 text-[11px] leading-relaxed text-warning" data-selectable>
                Can't run here: {status.unavailable}.
              </p>
            ) : null}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
