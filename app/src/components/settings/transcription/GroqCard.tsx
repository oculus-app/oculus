import { useEffect, useState } from "react";
import { Microphone, Sparkle, type Icon } from "@phosphor-icons/react";
import { GroqIcon } from "@/components/icons/GroqIcon";
import { Button } from "@/components/ui/button";
import { count, groqUsage, resetsIn, usageByRole, usageRows, type UsageRow } from "@/lib/dictation/groqUsage";
import { cn } from "@/lib/utils";

const ROLE_ICON: Record<UsageRow["role"], Icon> = { transcription: Microphone, cleanup: Sparkle };

/** Groq's figures from its last answers since launch; never calls Groq. */
function useGroqRows(): UsageRow[] | null {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    groqUsage()
      .then(({ models }) => {
        if (!cancelled) setRows(usageRows(usageByRole(models)));
      })
      .catch((cause) => console.error("Groq usage read failed", cause));
    return () => {
      cancelled = true;
    };
  }, []);
  return rows;
}

/**
 * Groq at the top of Settings → Transcription, since its one key serves both
 * transcription and dictation cleanup: whether a key is saved, what it is
 * used for, and the allowance Groq's answers reported since launch, a figure
 * per role, in the warning colour under a tenth.
 */
export function GroqCard({ connected, onOpen }: {
  /** null until the keychain has answered. */
  connected: boolean | null;
  onOpen: () => void;
}) {
  const rows = useGroqRows();
  const now = Date.now();
  return (
    <div className="mt-1 mb-3 rounded-lg border border-border-subtle bg-card px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <GroqIcon aria-hidden size={18} className="shrink-0 text-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground">
            Groq
            {connected !== null ? (
              <span className={cn("ml-2 text-[11px]", connected ? "text-muted-foreground" : "text-warning")}>
                {connected ? "Key saved" : "No key"}
              </span>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {connected === false
              ? "Add a key to transcribe with Whisper and tidy dictation with Qwen, in the cloud."
              : "Transcribes with Whisper and tidies dictation with Qwen 3.8 27B."}
          </p>
        </div>
        <Button variant="outline" size="xs" className="w-16 shrink-0" onClick={onOpen}>
          {connected ? "Manage" : "Set up"}
        </Button>
      </div>
      {connected ? (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-border-subtle pt-2 pl-[28px] text-[11px] text-muted-foreground">
          {rows === null ? (
            " "
          ) : rows.length === 0 ? (
            "Its allowance shows here once Groq has answered since launch."
          ) : (
            rows.map((row) => <Figure key={row.role} row={row} now={now} />)
          )}
        </div>
      ) : null}
    </div>
  );
}

function Figure({ row, now }: { row: UsageRow; now: number }) {
  const RoleIcon = ROLE_ICON[row.role];
  const reset = resetsIn(row.resetsAt, now);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <RoleIcon aria-hidden size={12} weight="bold" className={row.warn ? "text-warning" : undefined} />
      <span>
        <span className={cn("tabular-nums", row.warn ? "font-medium text-warning" : "text-foreground")}>
          {count(row.remaining)}
        </span>
        <span className="tabular-nums"> of {count(row.limit)}</span> {row.noun} left {row.window}
        {reset ? <span className="tabular-nums"> · {reset}</span> : null}
      </span>
    </span>
  );
}
