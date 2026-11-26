import { Check } from "@phosphor-icons/react";
import type { AgentQuestion } from "@/lib/harness";
import { cn } from "@/lib/utils";

const stepLabel = (question: AgentQuestion, i: number) => question.header || `Question ${i + 1}`;

/**
 * Where the question tray is: one pill per question by its header, the
 * current one brand-tinted, earlier ones checked and pressable to go back,
 * later ones muted. One question shows its header as plain text.
 */
export function StepPills({ questions, index, busy, onGoTo }: { questions: AgentQuestion[]; index: number; busy: boolean; onGoTo: (i: number) => void }) {
  if (questions.length === 1) {
    const header = questions[0].header;
    return header ? (
      <span className="min-w-0 truncate text-[11.5px] font-medium text-muted-foreground" title={header}>
        {header}
      </span>
    ) : null;
  }
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-1" aria-label="Questions">
      {questions.map((q, i) => {
        const label = stepLabel(q, i);
        const pill = "inline-flex max-w-40 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11.5px] leading-4";
        if (i < index) {
          return (
            <li key={q.id} className="min-w-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => onGoTo(i)}
                title={`Back to ${label}`}
                className={cn(pill, "cursor-pointer border-transparent text-foreground transition-colors hover:bg-accent disabled:cursor-default")}
              >
                <Check size={11} weight="bold" className="shrink-0 text-success" aria-hidden />
                <span className="truncate">{label}</span>
              </button>
            </li>
          );
        }
        return (
          <li
            key={q.id}
            aria-current={i === index ? "step" : undefined}
            className={cn(
              pill,
              "min-w-0",
              i === index ? "border-brand/35 bg-brand/15 text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
