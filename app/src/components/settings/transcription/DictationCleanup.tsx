import { Button } from "@/components/ui/button";
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

/** The engine a cleanup tries first, by Rust's rule (`dictation_cleanup_status`):
 *  Groq with a key, else S1-mini when it is downloaded and can run here. */
export function engineLine(connected: boolean | null, s1: S1MiniStatus | null): { text: string; warn: boolean } {
  if (connected === null || s1 === null) return { text: "\u00a0", warn: false };
  const s1Ready = s1.status === "present" && !s1.unavailable;
  if (connected) {
    return {
      text: `Groq's ${QWEN}, using your Groq key.${s1Ready ? ` ${s1.label} steps in if Groq fails.` : ""}`,
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

/**
 * How dictated text is tidied before it joins the draft: Groq's Qwen on the
 * page's Groq key, else S1-mini by Superwhisper downloaded like a Whisper
 * model (macOS only). Reads disk and keyd only; only Download goes online.
 */
export function DictationCleanup({ connected, onOpenGroq }: {
  /** The page's Groq key state; null until the keychain has answered. */
  connected: boolean | null;
  onOpenGroq: () => void;
}) {
  const pack = usePackDownload(S1_MINI);
  const { status, download } = pack;
  const line = engineLine(connected, status);

  return (
    <div className="mt-5">
      <p className="text-xs text-foreground">Dictation cleanup</p>
      <p className="text-[11px] text-muted-foreground">Tidies what you dictate before it joins your draft.</p>
      <p className={line.warn ? "mt-1 text-[11px] text-warning" : "mt-1 text-[11px] text-muted-foreground"}>
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
              missing={connected === false ? "Dictation can't be tidied until this is downloaded or a Groq key is added." : undefined}
              deleteDescription={
                connected
                  ? "Groq then tidies dictation with no fallback. It can be downloaded again from here."
                  : "Dictation can't be tidied until it is downloaded again from here or a Groq key is added."
              }
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
