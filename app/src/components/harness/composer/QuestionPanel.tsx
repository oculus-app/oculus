import { useEffect, useRef } from "react";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { Button } from "@/components/ui/button";
import { useTabActive, useTabId } from "@/components/tabs/TabContext";
import { activePane } from "@/stores/shell/tabStore";
import { digitOption, otherDigit, typingTarget, type AgentQuestion, type AnswerDraft, type Provider } from "@/lib/harness";
import { shortcut } from "@/lib/platform";
import { KeyCap } from "./KeyCap";
import { OptionCards } from "./question/OptionCards";
import { StepPills } from "./question/StepPills";
import type { QuestionComposer } from "./useQuestionComposer";

/**
 * An agent's question, as a tray on top of the composer: step pills, one
 * question at a time with its options as cards, Skip, and Back and the
 * answer below. Digits 1–9 pick while focus is not where text is typed; a
 * typed answer goes in the composer below ("Something else" focuses it).
 * Rust's refusal is said inside the tray, never in a toast. The flow is
 * `useQuestionComposer`'s; this only draws it.
 */
export function QuestionPanel({ flow, onOther }: { flow: QuestionComposer; onOther?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const active = useTabActive();
  const paneId = useTabId();
  const latest = useRef({ flow, onOther });
  latest.current = { flow, onOther };

  // Window-wide, as T3's, but only in the focused pane of the active tab and
  // only when focus is on nothing in particular or inside this tray, so a
  // second pane's tray or a field elsewhere never takes the digit.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (!paneTakesDigit(paneId, activePane()?.id)) return;
      const target = e.target as HTMLElement | null;
      if (typingTarget(target)) return;
      const focus = document.activeElement;
      const here = focus == null || focus === document.body || !!root.current?.contains(focus);
      if (!here) return;
      const { flow: f, onOther: other } = latest.current;
      const label = digitOption(e.key, f.question);
      if (label) {
        e.preventDefault();
        f.pick(label);
        return;
      }
      if (other && e.key === String(otherDigit(f.question))) {
        e.preventDefault();
        other();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, paneId]);

  return (
    <QuestionPanelView
      rootRef={root}
      provider={flow.request.provider}
      questions={flow.questions}
      question={flow.question}
      draft={flow.draft}
      index={flow.index}
      ready={flow.ready}
      busy={flow.busy}
      error={flow.error}
      moved={flow.moved}
      primaryLabel={flow.primaryLabel}
      onPick={flow.pick}
      onBack={flow.back}
      onGoTo={flow.goTo}
      onPrimary={flow.primary}
      onDismiss={flow.dismiss}
      onOther={onOther}
    />
  );
}

/** Whether this pane may take a digit: only the focused pane does, so two
 *  split panes with waiting questions never both answer. Outside any pane
 *  (id 0) the tray always may. */
export function paneTakesDigit(paneId: number, focusedPaneId: number | undefined): boolean {
  return paneId === 0 || focusedPaneId === paneId;
}

/** The tray as drawn, given its state (tests render it alone). */
export function QuestionPanelView({
  rootRef,
  provider,
  questions,
  question,
  draft,
  index,
  ready,
  busy,
  error,
  moved,
  primaryLabel,
  onPick,
  onBack,
  onGoTo,
  onPrimary,
  onDismiss,
  onOther,
}: {
  rootRef?: React.Ref<HTMLDivElement>;
  provider: Provider;
  questions: AgentQuestion[];
  question: AgentQuestion;
  draft: AnswerDraft;
  index: number;
  ready: boolean;
  busy: boolean;
  error: string | null;
  moved: boolean;
  primaryLabel: string;
  onPick: (label: string) => void;
  onBack: () => void;
  onGoTo: (index: number) => void;
  onPrimary: () => void;
  onDismiss: () => void;
  /** "Something else": focuses the typed answer. */
  onOther?: () => void;
}) {
  const typed = question.allowsTypedAnswer && draft.text.trim().length > 0;
  const picked = draft.dismissed ? 0 : draft.selected.length + (typed ? 1 : 0);
  return (
    <div ref={rootRef} data-question-panel={question.id} className="flex flex-col gap-2.5 rounded-t-[inherit] px-3.5 pb-2.5 pt-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <ProviderMark provider={provider} className="size-3.5 shrink-0" />
        <StepPills questions={questions} index={index} busy={busy} onGoTo={onGoTo} />
        <Button
          size="xs"
          variant="ghost"
          disabled={busy}
          onClick={onDismiss}
          aria-label="Dismiss this question without answering"
          title="Dismiss this question without answering"
          className="ml-auto text-muted-foreground will-change-[opacity]"
        >
          Skip
        </Button>
      </div>
      <p data-selectable className="break-words text-sm font-medium leading-snug text-foreground">
        {question.text}
      </p>
      {question.options.length > 0 && (
        <OptionCards question={question} draft={draft} busy={busy} onPick={onPick} onOther={onOther} />
      )}
      {moved && (
        <p className="text-[11px] text-muted-foreground">What you typed was moved to your message draft.</p>
      )}
      {error && (
        <p role="alert" className="break-words text-[11px] leading-relaxed text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {index > 0 && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={onBack} className="will-change-[opacity]">
            Back
          </Button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {question.multi && (
            <span className="text-[11px] tabular-nums text-muted-foreground">{picked} selected</span>
          )}
          <Button size="xs" disabled={!ready || busy} onClick={onPrimary} className="will-change-[opacity]">
            {primaryLabel}
            <KeyCap fill>{shortcut("enter")}</KeyCap>
          </Button>
        </div>
      </div>
    </div>
  );
}
