import { ChipRemove } from "@/components/ui/ChipRemove";
import { Toast } from "@/components/ui/Toast";
import { resetsIn, rowFigure, usageRows, type DictationUsage, type UsageRow } from "@/lib/dictation/groqUsage";
import { cn } from "@/lib/utils";

/**
 * After a dictation Groq took part in, what Groq's answers say is left of its
 * allowance: the app's one toast (docs/ui.md). A meter per figure Groq
 * reported, in the warning colour under a tenth, each with its reset.
 */
export function GroqUsageToast({ usage, onDismiss }: { usage: DictationUsage | null; onDismiss: () => void }) {
  const rows = usage ? usageRows(usage) : [];
  return (
    <Toast open={rows.length > 0} onClose={onDismiss}>
      <GroqUsageCard rows={rows} now={Date.now()} onDismiss={onDismiss} />
    </Toast>
  );
}

/** The toast's body, apart from its timing, so it renders on its own. */
export function GroqUsageCard({ rows, now, onDismiss }: { rows: UsageRow[]; now: number; onDismiss: () => void }) {
  return (
    <div className="px-3.5 pt-2.5 pb-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[13px] font-semibold text-foreground">
          Groq <span className="font-sans font-normal text-muted-foreground">allowance left</span>
        </p>
        <ChipRemove label="Dismiss Groq usage" onRemove={onDismiss} className="-mr-1" />
      </div>
      <ul className="mt-2 flex flex-col gap-2.5">
        {rows.map((row) => (
          <MeterRow key={row.role} row={row} now={now} />
        ))}
      </ul>
    </div>
  );
}

function MeterRow({ row, now }: { row: UsageRow; now: number }) {
  const reset = resetsIn(row.resetsAt, now);
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="min-w-0 truncate text-foreground">{row.label}</span>
        <span className={cn("shrink-0 tabular-nums", row.warn ? "font-medium text-warning" : "text-foreground")}>
          {rowFigure(row)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${row.label} left`}
        aria-valuemin={0}
        aria-valuemax={row.limit}
        aria-valuenow={row.remaining}
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-foreground/10"
      >
        <div
          className={cn("h-full rounded-full", row.warn ? "bg-warning" : "bg-primary")}
          style={{ width: `${row.remaining > 0 ? Math.max(2, row.left * 100) : 0}%` }}
        />
      </div>
      {reset ? <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{capital(reset)}</p> : null}
    </li>
  );
}

const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;
