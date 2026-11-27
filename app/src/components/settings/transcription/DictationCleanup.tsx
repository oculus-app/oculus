import type { ReactNode } from "react";
import { Prohibit } from "@phosphor-icons/react";
import { GroqIcon } from "@/components/icons/GroqIcon";
import { SuperwhisperIcon } from "@/components/icons/SuperwhisperIcon";
import { PackDownloadRow, packState } from "@/components/settings/voice/PackDownloadRow";
import { usePackDownload, type PackApi } from "@/components/settings/voice/usePackDownload";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { isMac } from "@/lib/platform";
import {
  cancelS1Mini,
  dictationCleanupStatus,
  downloadS1Mini,
  onS1MiniProgress,
  removeS1Mini,
  type S1MiniStatus,
} from "@/lib/dictation/cleanup";
import type { CleanupChoice, CleanupModel } from "@/lib/lectures/transcribe";
import { cn } from "@/lib/utils";
import { modelSize } from "./LocalWhisper";

const S1_MINI: PackApi<S1MiniStatus> = {
  name: "S1-mini",
  status: () => dictationCleanupStatus().then((status) => status.s1Mini),
  download: downloadS1Mini,
  cancel: cancelS1Mini,
  remove: removeS1Mini,
  onProgress: onS1MiniProgress,
};

/** `groq::MODEL` (`qwen/qwen3.8-27b`) as the page names it. */
const QWEN = "Qwen 3.8 27B";

const MODELS: Record<CleanupModel, { name: string; icon: ReactNode }> = {
  groq: { name: `Groq · ${QWEN}`, icon: <GroqIcon aria-hidden size={14} className="shrink-0 text-foreground" /> },
  s1Mini: {
    name: "S1-mini by Superwhisper",
    icon: <SuperwhisperIcon aria-hidden size={14} className="shrink-0 text-foreground" />,
  },
  off: { name: "Off", icon: <Prohibit aria-hidden size={14} className="shrink-0 text-muted-foreground" /> },
};

/** Short names for mid-sentence use. */
const SHORT: Record<"groq" | "s1Mini", string> = { groq: "Groq", s1Mini: "S1-mini" };

type Line = { text: string; warn: boolean };

/** Whether each model can clean right now; null while unknown. */
function readiness(connected: boolean | null, s1: S1MiniStatus | null) {
  return {
    groq: connected,
    s1Mini: s1 === null ? null : s1.status === "present" && !s1.unavailable,
  };
}

/** What the chosen model does now, under the Model select, by Rust's rule
 *  (`run` in `transcribe/cleanup/mod.rs`). Blank while a status is unread. */
export function modelLine(
  choice: CleanupChoice | null,
  connected: boolean | null,
  s1: S1MiniStatus | null,
  mac = isMac,
): Line {
  const blank = { text: " ", warn: false };
  if (choice === null) return blank;
  if (choice.model === "off") return { text: "Dictation joins your draft as heard.", warn: false };
  const ready = readiness(connected, s1)[choice.model];
  if (ready === null) return blank;
  if (choice.model === "groq") {
    return ready
      ? { text: "Runs on Groq with your key.", warn: false }
      : { text: "No Groq key: add one above.", warn: true };
  }
  if (ready) {
    return {
      text: choice.fallback ? "Runs on this Mac." : "Runs on this Mac; dictation never goes to Groq.",
      warn: false,
    };
  }
  if (s1?.unavailable || !mac) return { text: "S1-mini can't run here: choose another model.", warn: true };
  return { text: "Not downloaded: download it below.", warn: true };
}

/** The fallback switch's line: which model steps in, and whether it is set
 *  up. Null where there is no fallback to offer (Off, or not on a Mac). */
export function fallbackLine(
  choice: CleanupChoice | null,
  connected: boolean | null,
  s1: S1MiniStatus | null,
  mac = isMac,
): Line | null {
  if (choice === null || choice.model === "off" || !mac) return null;
  const other = choice.model === "groq" ? "s1Mini" : "groq";
  const text = `${other === "s1Mini" ? "S1-mini by Superwhisper" : "Groq"} steps in if ${SHORT[choice.model]} fails or isn't set up.`;
  const ready = readiness(connected, s1)[other];
  if (!choice.fallback || ready !== false) return { text, warn: false };
  if (other === "groq") return { text: `${text} Add a Groq key above to use it.`, warn: true };
  if (s1?.unavailable) return { text: `S1-mini can't run here: ${s1.unavailable}.`, warn: true };
  return { text: `${text} Download it below to use it.`, warn: true };
}

/** S1-mini's row: what its absence means, and what deleting it does. */
function s1Notes(choice: CleanupChoice | null) {
  const relied = choice?.model === "s1Mini" || (choice?.model === "groq" && choice.fallback);
  if (choice?.model === "s1Mini" && !choice.fallback) {
    return {
      missing: "Dictation can't be tidied until this is downloaded.",
      deleted: "Dictation then can't be tidied until it is downloaded again or another model is chosen.",
    };
  }
  if (relied) {
    return {
      missing: undefined,
      deleted: `${choice?.model === "groq" ? "Groq then has no fallback" : "Groq then tidies dictation"}. It can be downloaded again from here.`,
    };
  }
  return { missing: undefined, deleted: "It can be downloaded again from here." };
}

/**
 * How dictated text is tidied before it joins the draft: the model (Groq's
 * Qwen on the page's Groq key, S1-mini by Superwhisper on this Mac, or Off),
 * whether the other one steps in, and S1-mini's download (macOS only). Reads
 * disk and keyd only; only Download goes online.
 */
export function DictationCleanup({ choice, onChange, connected }: {
  /** The stored choice; null until the settings row is read. */
  choice: CleanupChoice | null;
  onChange: (choice: CleanupChoice) => void;
  /** The page's Groq key state; null until the keychain has answered. */
  connected: boolean | null;
}) {
  const pack = usePackDownload(S1_MINI);
  const { status, download } = pack;
  const model = modelLine(choice, connected, status);
  const fallback = fallbackLine(choice, connected, status);
  const notes = s1Notes(choice);
  // S1-mini runs on macOS only; elsewhere it is offered only while chosen.
  const models = (["groq", "s1Mini", "off"] as const).filter((m) => m !== "s1Mini" || isMac || choice?.model === m);

  return (
    <div className="mt-5">
      <p className="text-xs text-foreground">Dictation cleanup</p>
      <p className="text-[11px] text-muted-foreground">Tidies what you dictate before it joins your draft.</p>

      <div className="mt-2 divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
        <Row title="Model" line={model}>
          <Select
            value={choice?.model}
            disabled={!choice}
            onValueChange={(next) => choice && onChange({ ...choice, model: next as CleanupModel })}
          >
            <SelectTrigger aria-label="Dictation cleanup model" size="sm" className="h-7 w-56 text-xs">
              <SelectValue placeholder="—">
                {choice ? (
                  <>
                    {MODELS[choice.model].icon}
                    {MODELS[choice.model].name}
                  </>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m} value={m} textValue={MODELS[m].name} className="text-xs">
                  {MODELS[m].icon}
                  {MODELS[m].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {fallback && choice ? (
          <Row title="Fallback" line={fallback}>
            <Switch
              aria-label={`Fall back to ${choice.model === "groq" ? "S1-mini" : "Groq"}`}
              checked={choice.fallback}
              onCheckedChange={(checked) => onChange({ ...choice, fallback: checked })}
            />
          </Row>
        ) : null}
        {isMac ? (
          <div className="px-3">
            <PackDownloadRow
              name={status?.label ?? "S1-mini by Superwhisper"}
              icon={<SuperwhisperIcon aria-hidden size={16} className="shrink-0 text-foreground" />}
              detail={
                status
                  ? `${modelSize(status.bytes)} download · English only · Runs on this Mac · ${packState(status.status, download !== null)}`
                  : " "
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ title, line, children }: { title: string; line: Line; children: ReactNode }) {
  return (
    <div className="settings-row flex items-center justify-between gap-4 px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-foreground">{title}</p>
        <p className={cn("text-[11px]", line.warn ? "text-warning" : "text-muted-foreground")}>{line.text}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
