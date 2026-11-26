import { Check } from "@phosphor-icons/react";
import { otherDigit, splitRecommended, type AgentQuestion, type AnswerDraft } from "@/lib/harness";
import { cn } from "@/lib/utils";

const CARD = "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left outline-none transition-colors disabled:opacity-60";
const IDLE = "border-border bg-card hover:border-foreground/20 focus-visible:border-ring";
const PICKED = "border-brand/60 bg-brand/[0.08]";

/**
 * A question's options as cards: a key chip with its digit (the first
 * nine), the label with a "Recommended" badge where the agent marked one,
 * the description under it, and a check once picked. Radios for a single
 * choice, checkboxes for several. Where a typed answer is taken beside them,
 * a dashed "Something else" card last points at the box below.
 */
export function OptionCards({
  question,
  draft,
  busy,
  onPick,
  onOther,
}: {
  question: AgentQuestion;
  draft: AnswerDraft;
  busy: boolean;
  onPick: (label: string) => void;
  onOther?: () => void;
}) {
  const typed = question.allowsTypedAnswer && draft.text.trim().length > 0 && !draft.dismissed;
  const other = question.allowsTypedAnswer && question.options.length > 0;
  const otherKey = otherDigit(question);
  return (
    <div className="flex flex-col gap-1.5">
      <div role={question.multi ? "group" : "radiogroup"} aria-label={question.text} className="flex flex-col gap-1.5">
        {question.options.map((option, i) => {
          const on = draft.selected.includes(option.label) && !draft.dismissed;
          const { text, recommended } = splitRecommended(option.label);
          return (
            <button
              key={option.label}
              type="button"
              role={question.multi ? "checkbox" : "radio"}
              aria-checked={on}
              disabled={busy}
              onClick={() => onPick(option.label)}
              className={cn(CARD, "cursor-default", on ? PICKED : IDLE)}
            >
              <KeyChip on={on}>{i < 9 ? i + 1 : null}</KeyChip>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="break-words text-[13px] font-medium leading-5 text-foreground">
                  {text}
                  {recommended && <RecommendedBadge />}
                </span>
                {option.description && (
                  <span className="break-words text-xs leading-relaxed text-muted-foreground">{option.description}</span>
                )}
              </span>
              {on && <Check size={14} weight="bold" className="mt-[3px] shrink-0 text-brand" aria-hidden />}
            </button>
          );
        })}
      </div>
      {other && (
        <button
          type="button"
          disabled={busy}
          aria-pressed={typed}
          onClick={onOther}
          className={cn(CARD, "cursor-text border-dashed", typed ? PICKED : "border-border bg-transparent hover:border-foreground/20 focus-visible:border-ring")}
        >
          <KeyChip on={typed} dashed={!typed}>{otherKey}</KeyChip>
          <span className="min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
            Something else… <span className="text-xs">type it below</span>
          </span>
          {typed && <Check size={14} weight="bold" className="mt-[3px] shrink-0 text-brand" aria-hidden />}
        </button>
      )}
    </div>
  );
}

/** The digit an option answers to, filled once it is picked. */
function KeyChip({ on, dashed = false, children }: { on: boolean; dashed?: boolean; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold leading-none tabular-nums",
        on ? "bg-primary text-primary-foreground" : dashed ? "border border-dashed border-border text-muted-foreground" : "bg-surface-raised text-muted-foreground",
      )}
    >
      {children}
    </kbd>
  );
}

/** The agent's "(Recommended)", said as a badge after the label. */
export function RecommendedBadge() {
  return (
    <span className="ml-1.5 inline-block rounded-full bg-success/15 px-1.5 py-px align-[1px] text-[10.5px] font-semibold leading-4 text-success">
      Recommended
    </span>
  );
}
