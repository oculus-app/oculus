import { ChatCircleText, ChatCircleSlash } from "@phosphor-icons/react";
import { questionPayload, questionRowState, splitRecommended, type AgentQuestion, type HarnessRequest } from "@/lib/harness";
import { RequestNotes, SettledRow } from "./SettledRow";
import { WaitingRow } from "./WaitingRow";

/**
 * A question request's row. Waiting, it is one line saying so, opening to
 * what the agent asked; the answer is given in the composer's question tray
 * (`QuestionPanel`). Answered, "You answered Codex" over each question
 * beside its answers as chips, or "Skipped". A dismissed, expired or
 * cancelled request is one quiet line opening to the questions. Like an
 * approval, it sits outside the run's work fold.
 */
export function QuestionView({ request }: { request: HarnessRequest }) {
  const state = questionRowState(request);
  const questions = questionPayload(request)?.questions ?? [];

  if (state.kind === "waiting") {
    return (
      <WaitingRow
        requestId={request.id}
        tone="brand"
        label={state.label}
        subject={questions.length === 1 ? questions[0].text : `${questions.length} questions`}
        notes={state.notes}
        warn={state.warn}
      >
        <p className="text-[11px] text-muted-foreground">{state.title}</p>
        {questions.map((q) => (
          <Asked key={q.id} question={q} />
        ))}
      </WaitingRow>
    );
  }

  if (state.kind === "answered") {
    return (
      <div data-request={request.id} data-request-state="answered" className="flex min-w-0 items-start gap-1.5 px-2 py-0.5">
        <ChatCircleText size={14} className="mt-[3px] shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs leading-5">
          <span className="text-muted-foreground">{state.title}</span>
          <div className="grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1">
            {state.entries.map((entry) => (
              <AnswerLine key={entry.question.id} entry={entry} />
            ))}
          </div>
          <RequestNotes notes={state.notes} warn={state.warn} />
        </div>
      </div>
    );
  }

  return (
    <SettledRow
      icon={ChatCircleSlash}
      state={state.kind}
      label={state.label}
      subject={questions[0]?.text ?? "A question"}
      title={state.title}
      notes={state.notes}
      warn={state.warn}
    >
      {questions.map((q) => (
        <Asked key={q.id} question={q} />
      ))}
    </SettledRow>
  );
}

/** One answered question: its header (or text) muted, its answers as chips. */
function AnswerLine({ entry }: { entry: ReturnType<typeof questionRowState>["entries"][number] }) {
  const { question } = entry;
  return (
    <>
      <span data-selectable className="max-w-56 break-words text-muted-foreground" title={question.header ? question.text : undefined}>
        {question.header || question.text}
      </span>
      {entry.dismissed ? (
        <span className="text-muted-foreground">Skipped</span>
      ) : (
        <span data-selectable className="flex min-w-0 flex-wrap gap-1">
          {entry.answers.map((answer) => (
            <span key={answer} className="max-w-full break-words rounded-full bg-surface-raised px-2 py-px text-[11.5px] leading-5 text-foreground">
              {splitRecommended(answer).text}
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/** One question as asked: its header, its text and the options offered. */
function Asked({ question }: { question: AgentQuestion }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {question.header && <span className="text-[11px] text-muted-foreground">{question.header}</span>}
      <p data-selectable className="break-words text-[12.5px] leading-snug text-foreground">
        {question.text}
      </p>
      {question.options.length > 0 && (
        <p className="break-words text-[11px] leading-relaxed text-muted-foreground">
          {question.options.map((o) => o.label).join(" · ")}
          {question.multi && " — choose any"}
        </p>
      )}
    </div>
  );
}
