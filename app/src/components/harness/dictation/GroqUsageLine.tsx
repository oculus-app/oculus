import { ChipRemove } from "@/components/ui/ChipRemove";
import { summarizeUsage, type DictationUsage } from "@/lib/dictation/groqUsage";
import { cn } from "@/lib/utils";

/**
 * After a dictation Groq took part in, how much of Groq's allowance its
 * answers say is left: one quiet line above the composer, in the warning
 * colour under a tenth, each figure's reset in its tooltip. It stays until
 * the draft is sent, the next dictation starts, or × dismisses it.
 */
export function GroqUsageLine({ usage, onDismiss }: { usage: DictationUsage | null; onDismiss: () => void }) {
  const summary = usage && summarizeUsage(usage);
  if (!summary) return null;
  return (
    <div className="flex min-w-0 items-center gap-1 px-0.5 text-[11px] text-muted-foreground">
      <p
        role="status"
        title={summary.detail}
        className={cn("min-w-0 truncate tabular-nums", summary.warn && "text-warning")}
      >
        Groq {summary.window}: {summary.parts.join(" · ")} left
      </p>
      <ChipRemove label="Dismiss Groq usage" onRemove={onDismiss} />
    </div>
  );
}
