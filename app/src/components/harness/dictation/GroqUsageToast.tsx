import { Microphone, Sparkle, type Icon } from "@phosphor-icons/react";
import { GroqIcon } from "@/components/icons/GroqIcon";
import { ChipRemove } from "@/components/ui/ChipRemove";
import { Toast } from "@/components/ui/Toast";
import { resetsIn, rowCount, usageRows, type DictationUsage, type UsageRow } from "@/lib/dictation/groqUsage";
import { cn } from "@/lib/utils";

/**
 * After a dictation Groq took part in, one line of what Groq's answers say is
 * left: Groq's bolt, "Groq left today", then each figure behind its role's
 * icon. A figure under a tenth turns the warning colour, badge included, and
 * says its reset.
 */
export function GroqUsageToast({ usage, onDismiss }: { usage: DictationUsage | null; onDismiss: () => void }) {
  const rows = usage ? usageRows(usage) : [];
  return (
    <Toast open={rows.length > 0} onClose={onDismiss} className="w-auto max-w-full rounded-full">
      <GroqUsageLine rows={rows} now={Date.now()} onDismiss={onDismiss} />
    </Toast>
  );
}

const ROLE_ICON: Record<UsageRow["role"], Icon> = { transcription: Microphone, cleanup: Sparkle };

/** The toast's body, apart from its timing, so it renders on its own. */
export function GroqUsageLine({ rows, now, onDismiss }: { rows: UsageRow[]; now: number; onDismiss: () => void }) {
  // One window for every figure says it once, up front; mixed, each says its own.
  const shared = rows.every((row) => row.window === rows[0]?.window) ? rows[0]?.window : undefined;
  const warn = rows.some((row) => row.warn);
  return (
    <div className="flex items-center gap-2.5 py-1.5 pr-2 pl-1.5 text-[13px]">
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full",
          warn ? "bg-warning/15 text-warning" : "bg-foreground/10 text-foreground",
        )}
      >
        <GroqIcon size={16} />
      </span>
      <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
        <span className="whitespace-nowrap">
          <span className="font-semibold text-foreground">Groq</span> left{shared ? ` ${shared}` : ""}
        </span>
        {rows.map((row) => (
          <Figure key={row.role} row={row} now={now} withWindow={!shared} />
        ))}
      </p>
      <ChipRemove label="Dismiss Groq usage" onRemove={onDismiss} />
    </div>
  );
}

function Figure({ row, now, withWindow }: { row: UsageRow; now: number; withWindow: boolean }) {
  const RoleIcon = ROLE_ICON[row.role];
  const reset = row.warn ? resetsIn(row.resetsAt, now) : null;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <RoleIcon aria-hidden size={14} weight="bold" className={row.warn ? "text-warning" : undefined} />
      <span>
        <span className={cn("tabular-nums", row.warn ? "font-medium text-warning" : "text-foreground")}>
          {rowCount(row)}
        </span>{" "}
        {row.noun}
        {withWindow ? ` ${row.window}` : ""}
        {reset ? <span className="tabular-nums">, {reset}</span> : null}
      </span>
    </span>
  );
}
