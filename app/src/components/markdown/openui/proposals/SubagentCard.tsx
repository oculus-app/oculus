import { useCallback, useContext, useMemo, useState } from "react";
import { Fold } from "@/components/ui/Fold";
import { ArrowBendDownRight, CaretDown, SpinnerGap, TreeStructure } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { ChainPicker } from "@/components/settings/jobs/ChainPicker";
import { useComposerSelection } from "@/components/harness/threads/useComposerSelection";
import { useProviderModels } from "@/hooks/agents/useProviderModels";
import type { Provider } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { cn } from "@/lib/utils";
import { StreamingPending } from "../Streaming";
import { useWidgetRow } from "../state";
import { CardChip } from "./CardChip";
import { CardCallout, useCardStreaming } from "./CardFrame";
import { cardState } from "./cardState";
import { continueLabel, followUp, followUpNote } from "./followUp";
import { useJobProgress } from "./JobProgress.tsx";
import { MarkdownInput } from "./MarkdownInput";
import { type Row } from "./model";
import { SubagentProgress } from "./SubagentProgress";
import { ONE_LEVEL, childOf, finishedTime, firstLine, fitLevel, pickReady, subagentPhase, subagentPick, withPick } from "./subagent";
import { useProposal } from "./useProposal";

export function SubagentCard({ input }: { input: Row }) {
  const streaming = useCardStreaming();
  const pending = useContext(StreamingPending);
  if (streaming && pending) {
    return (
      <section aria-busy="true" aria-label="Subagent" className="my-2.5 flex w-full min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface text-muted-foreground">
          <TreeStructure size={15} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-shimmer font-display text-[13px] leading-[18px] font-semibold">Drawing a subagent…</span>
          <span className="block-shimmer h-2.5 w-2/5 rounded-full" aria-hidden />
        </div>
      </section>
    );
  }
  return <SubagentCardContent input={input} />;
}

/**
 * `Subagent(title, task, then?)`: the agent proposes handing `task` to a
 * child chat. Pending, a single compact bar carries the title, inline model
 * pill, a brief line that opens the Live-mode editor underneath, and Discard
 * / Start. Started, it becomes the child's compact bar with a hover summary
 * card (`SubagentProgress`). docs/ui.md, "The Subagent card".
 */
function SubagentCardContent({ input }: { input: Row }) {
  const card = useProposal("Subagent", input);
  const streaming = useCardStreaming();
  const row = useWidgetRow();
  const parentThread = useHarnessStore((s) => row ? s.threads.find((t) => t.id === row.thread) ?? null : null);
  const { selection } = useComposerSelection(parentThread);
  const state = card.state;
  const chosen = subagentPick(state, selection);
  const [viewed, setViewed] = useState<ReadonlySet<Provider>>(new Set());
  const [briefOpen, setBriefOpen] = useState(false);
  const onView = useCallback((p: Provider) => setViewed((s) => (s.has(p) ? s : new Set(s).add(p))), []);
  const needed = useMemo(() => [...new Set([chosen.provider, ...viewed])], [chosen.provider, viewed]);
  // Lists models the way Settings does: never starts a CLI only its page may, never probes a model.
  const { providers } = useProviderModels(needed, { start: false });
  const run = useJobProgress("Subagent", state);
  const phase = subagentPhase(state);
  // A card that can still start shows, and Start writes, a level its model takes.
  const startable = !card.proposal || card.proposal.status === "pending" || phase === "interrupted";
  const pick = startable ? fitLevel(chosen, providers) : chosen;
  const frame = cardState({ streaming, id: card.id, status: card.proposal?.status, busy: card.busy, error: card.error, job: run.job.phase });
  const pending = !card.proposal || card.proposal.status === "pending";
  const follow = followUp(state);
  const note = followUpNote(follow, frame);
  const nested = parentThread?.parent_id != null;
  const ready = pickReady(pick, providers) && typeof state.task === "string" && !!state.task.trim();
  const title = typeof state.title === "string" && state.title.trim() ? state.title : "Hand this to a subagent";

  const start = () => {
    card.edit(withPick(state, pick));
    card.act("start");
  };
  const again = () => {
    if (pick.effort !== chosen.effort) card.edit(withPick(state, pick));
    card.act("start");
  };
  // The store names the decision in flight, so every view of the card agrees.
  const spinning = (action: "start" | "discard") => card.busy && card.acting === action && <SpinnerGap className="animate-spin" />;

  if (frame.collapsed) {
    return (
      <section aria-label="Subagent" data-phase={frame.phase} className="my-2.5 flex w-full min-w-0 items-center gap-3 rounded-xl border border-dashed bg-transparent px-3 py-2">
        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface/50 opacity-60">
          <ProviderMark provider={pick.provider} className="size-[15px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div role="heading" aria-level={4} className="truncate font-display text-[13px] leading-[18px] font-medium text-muted-foreground">
            {title}
          </div>
          {note && (
            <div className="mt-0.5 flex min-w-0 items-start gap-1.5 text-xs leading-5 text-muted-foreground">
              <ArrowBendDownRight size={13} className="mt-0.75 shrink-0" />
              <span className="min-w-0 break-words">{note}</span>
            </div>
          )}
        </div>
        <CardChip state={frame} />
      </section>
    );
  }

  if (!pending && phase) {
    const job = run.job;
    const report = phase === "complete" && typeof job.result === "string" ? job.result : null;
    const jobError = card.error
      ? card.error
      : phase !== "complete" && phase !== "running"
        ? String(job.error ?? "The subagent couldn’t finish.")
        : undefined;
    const restart = phase === "interrupted" ? (
      <Button size="xs" variant="secondary" disabled={card.busy || !ready} onClick={again}>
        {spinning("start")}
        {continueLabel("Start again", follow)}
      </Button>
    ) : undefined;
    return (
      <SubagentProgress
        id={card.id ?? ""}
        phase={phase}
        child={childOf(state)}
        report={report}
        error={jobError}
        duration={run.duration}
        finishedAt={finishedTime(state)}
        title={title}
        pick={pick}
        providers={providers}
        note={note}
        restart={restart}
      />
    );
  }

  const briefLine = firstLine(state.task);
  const error = card.error ?? (nested ? ONE_LEVEL : undefined);
  const loadFailed = frame.failure === "load";
  const sweep = frame.phase === "loading" || (frame.phase === "applying" && frame.locked);
  const chipText = card.busy ? (card.acting === "discard" ? "Discarding…" : "Starting…") : undefined;

  return (
    <section
      aria-label="Subagent"
      data-phase={frame.phase}
      aria-busy={frame.locked || undefined}
      className="relative my-2.5 w-full min-w-0 rounded-xl border bg-card"
    >
      {(sweep || frame.phase === "failed") && (
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 overflow-hidden rounded-t-xl">
          <span className={cn("block h-0.5 w-full", sweep ? "progress-sweep" : "bg-destructive/70")} />
        </span>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <span className="relative flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface">
          {card.busy && (
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-0.5 rounded-full border-[1.5px] border-dashed border-brand motion-safe:animate-[spin_4s_linear_infinite]"
            />
          )}
          <ProviderMark provider={pick.provider} className="size-[15px]" />
        </span>

        <div className="flex min-w-0 flex-1 basis-52 flex-col gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <div
              role="heading"
              aria-level={4}
              className={cn(
                "min-w-0 truncate font-display text-[13px] leading-[18px] font-semibold tracking-[-0.01em]",
                frame.phase === "streaming" && "text-shimmer",
              )}
            >
              {title}
            </div>
            <ChainPicker
              providers={providers}
              entry={pick.model ? { provider: pick.provider, model: pick.model, reasoningEffort: pick.effort } : null}
              fallbackProvider={pick.provider}
              onView={onView}
              emptyLabel="Choose a model"
              disabled={!frame.editable}
              className="h-5 max-w-[200px] shrink-0 px-1.5 text-[11px]"
              onPick={(p) => card.edit(withPick(state, { provider: p.provider, model: p.model, effort: p.reasoningEffort }))}
            />
          </div>

          <button
            type="button"
            data-brief-toggle
            aria-expanded={briefOpen}
            onClick={() => setBriefOpen((o) => !o)}
            className="group/brief flex min-w-0 max-w-full cursor-pointer items-center gap-1 text-left text-[12px] leading-[17px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="min-w-0 truncate">{briefLine || "Add a brief…"}</span>
            <CaretDown size={11} className={cn("shrink-0 opacity-70 transition-transform", briefOpen && "rotate-180")} />
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {(card.busy || frame.phase !== "pending") && <CardChip state={frame} text={chipText} />}
          <Button variant="ghost" size="xs" disabled={!frame.editable} onClick={() => card.act("discard")}>
            {spinning("discard")}
            {continueLabel("Discard", follow)}
          </Button>
          <Button size="xs" disabled={!frame.editable || !ready || nested} onClick={start}>
            {spinning("start")}
            {continueLabel("Start", follow)}
          </Button>
        </div>
      </div>

      <Fold open={briefOpen}>
        <div
          inert={frame.locked || undefined}
          className={cn(
            "border-t border-border-subtle py-2.5 pr-3 pl-[54px] text-[13px] leading-5 transition-opacity",
            frame.locked && "opacity-55",
          )}
        >
          {frame.editable ? (
            <MarkdownInput
              value={state.task}
              label="Brief"
              subjectId={parentThread?.subject_id ?? null}
              onChange={(task) => card.edit({ ...state, task })}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words">{String(state.task ?? "")}</div>
          )}
        </div>
      </Fold>

      {error && (
        <CardCallout className="mx-3 mt-0 mb-2.5" onRetry={loadFailed ? card.retry : undefined}>
          {loadFailed ? `Couldn’t load this card: ${error}` : error}
        </CardCallout>
      )}
    </section>
  );
}
