import { useEffect, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowBendDownRight,
  CaretRight,
  Check,
  Question,
  ShieldWarning,
  SpinnerGap,
  Terminal,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { modelSummary } from "@/components/harness/composer/model/modelSummary";
import { useRouteThread } from "@/components/harness/threads/useRouteThread";
import { useProviderModels } from "@/hooks/agents/useProviderModels";
import type { PickerProvider } from "@/lib/harness";
import { activityLine } from "@/lib/harness/activity";
import { chatHref } from "@/lib/harness/route";
import { stopDueAt, stopOverdue } from "@/lib/harness/runs";
import { openBeside } from "@/lib/shell/tabRouters";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useTabStore } from "@/stores/shell/tabStore";
import { cn } from "@/lib/utils";
import { CardCallout } from "./CardFrame";
import { firstLine, liveLine, liveRun, openingLines, waitingOn, type SubagentPhase, type SubagentPick } from "./subagent";

/** The child chat as the card watches it: held while it runs, so its rows
 *  (and so its live line) reach the store, and let go after. */
export function useSubagentChild(child: number | null, running: boolean) {
  useEffect(() => {
    if (child == null || !running) return;
    const store = useHarnessStore.getState();
    void store.hold(child);
    return () => {
      const after = useHarnessStore.getState();
      after.unhold(child);
      after.release(child);
    };
  }, [child, running]);
  const thread = useHarnessStore((s) => child == null ? undefined : s.threads.find((t) => t.id === child));
  const activity = useHarnessStore((s) => child == null ? null : activityLine(s.items[child]));
  const streaming = useHarnessStore((s) => child == null ? undefined : s.live[child]?.streaming);
  return { thread, line: liveLine(activity, streaming), waiting: waitingOn(thread), unstopped: useUnstopped(child) };
}

/** Whether the child's running turn was asked to stop and has not, by the
 *  chat's own measure (`stopOverdue`, which shows its Force stop): looked
 *  at again when the stop falls due. */
function useUnstopped(child: number | null): boolean {
  const run = useHarnessStore((s) => child == null ? undefined : liveRun(s.runs[child]));
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const due = stopDueAt(run);
    if (due == null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, due - Date.now()));
    return () => clearTimeout(timer);
  }, [run]);
  return stopOverdue(run, now);
}

/** Open the child beside this chat; ⌘-click opens it in a new tab. */
function openChild(href: string, newTab: boolean) {
  if (newTab) useTabStore.getState().addTab(href);
  else openBeside(href);
}

function OpenChat({ child, title, className }: { child: number; title: string | null; className?: string }) {
  const href = chatHref(child, title);
  return (
    <button
      type="button"
      data-tab-href={href}
      className={cn("cursor-pointer hover:text-brand hover:underline", className)}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        openChild(href, e.metaKey || e.ctrlKey);
      }}
    >
      Open the chat
    </button>
  );
}

/** Read-only model + level text, resolved from `providers` (or fetched without starting a CLI). */
function usePickWords(pick?: SubagentPick, knownProviders?: PickerProvider[]) {
  const { providers: loaded } = useProviderModels(knownProviders || !pick ? [] : pick.provider, { start: false });
  if (!pick) return null;
  const providers = knownProviders ?? loaded;
  const { label, levelText } = modelSummary({ providers, provider: pick.provider, model: pick.model, reasoning: pick.effort });
  return { label: label ?? pick.model ?? pick.provider, levelText };
}

function statusMeta(phase: SubagentPhase, waiting: string | null) {
  if (phase === "running") {
    if (waiting === "Waiting for approval") return { label: waiting, short: "Approval", tone: "text-warning", dot: "bg-warning", icon: ShieldWarning, spin: false };
    if (waiting === "Waiting for an answer") return { label: waiting, short: "Question", tone: "text-warning", dot: "bg-warning", icon: Question, spin: false };
    return { label: "Running", short: "Running", tone: "text-brand", dot: null, icon: SpinnerGap, spin: true };
  }
  if (phase === "complete") return { label: "Completed", short: "Finished", tone: "text-success", dot: "bg-success", icon: Check, spin: false };
  if (phase === "stopped") return { label: "Stopped", short: "Stopped", tone: "text-muted-foreground", dot: "bg-muted-foreground", icon: WarningCircle, spin: false };
  if (phase === "interrupted") return { label: "Interrupted", short: "Interrupted", tone: "text-destructive", dot: "bg-destructive", icon: WarningCircle, spin: false };
  return { label: "Failed", short: "Failed", tone: "text-destructive", dot: "bg-destructive", icon: WarningCircle, spin: false };
}

/**
 * A started Subagent card: one compact bar (avatar + status dot/ring, title,
 * single live or summary line, status/time/action and chevron to open the
 * child chat beside) with a floating hover card carrying the model, level,
 * duration and report opening. An overdue stop or follow-up note sits cleanly
 * underneath.
 */
export function SubagentProgress({
  id,
  phase,
  child,
  report,
  error,
  duration,
  finishedAt,
  title,
  pick,
  providers,
  note,
  restart,
}: {
  id: string;
  phase: SubagentPhase;
  child: number | null;
  report: string | null;
  error?: string;
  duration: string | null;
  finishedAt?: string | null;
  title?: string;
  pick?: SubagentPick;
  providers?: PickerProvider[];
  note?: string;
  restart?: ReactNode;
}) {
  const running = phase === "running";
  const { thread: listed, line, waiting, unstopped } = useSubagentChild(child, running);
  // A child read by id and found gone: its chat cannot be opened. Only its
  // existence matters here, so the read does not list it.
  const { thread: routed, missing: deleted } = useRouteThread(child, { keep: false });
  const thread = listed ?? routed;
  const openable = child != null && !deleted;
  const href = openable ? chatHref(child, thread?.title ?? title ?? null) : null;
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  useEffect(() => { if (!running) setCancelling(false); }, [running]);
  const cancel = async () => {
    setCancelling(true);
    setCancelError(undefined);
    try { await invoke("proposal_subagent_stop", { id }); }
    catch (cause) { setCancelError(String(cause)); setCancelling(false); }
  };

  const heading = title?.trim() || thread?.title?.trim() || "Subagent";
  const effectivePick: SubagentPick | undefined = pick ?? (thread ? { provider: thread.provider, model: thread.model, effort: null } : undefined);
  const pickWords = usePickWords(effectivePick, providers);
  const meta = statusMeta(phase, waiting);
  const StatusIcon = meta.icon;
  const opening = report ? openingLines(report) : null;
  const summaryLine = running
    ? (child == null ? "Starting the subagent…" : waiting ?? line)
    : phase === "complete"
      ? (firstLine(report) || "Completed")
      : (error ?? (phase === "stopped" ? "Stopped." : "The subagent couldn’t finish."));
  const hoverSnippet = running
    ? (child == null ? "Starting the subagent…" : waiting ?? line)
    : phase === "complete"
      ? opening
      : (error ?? null);

  const onBarClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!href) return;
    openChild(href, e.metaKey || e.ctrlKey);
  };
  const onBarKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!href) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChild(href, e.metaKey || e.ctrlKey);
    }
  };

  const isError = phase === "failed" || phase === "interrupted";
  const bar = (
    <div
      role={href ? "button" : undefined}
      tabIndex={href ? 0 : undefined}
      data-subagent-bar
      data-tab-href={href ?? undefined}
      aria-label={href ? `Open ${heading}` : undefined}
      onClick={href ? onBarClick : undefined}
      onKeyDown={href ? onBarKeyDown : undefined}
      className={cn(
        "group/sub flex w-full min-w-0 items-center gap-3 rounded-xl border bg-card px-3 py-2 text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
        isError ? "border-destructive/35" : "border-border",
        href && "cursor-pointer hover:border-foreground/20 hover:bg-surface/60",
      )}
    >
      <span className="relative flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface">
        {running && !waiting && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-0.5 rounded-full border-[1.5px] border-dashed border-brand motion-safe:animate-[spin_4s_linear_infinite]"
          />
        )}
        {effectivePick ? (
          <ProviderMark provider={effectivePick.provider} className="size-[15px]" />
        ) : (
          <StatusIcon size={14} className={cn(meta.tone, meta.spin && "animate-spin")} />
        )}
        {meta.dot && (
          <span
            aria-hidden
            className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card", meta.dot)}
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            role="heading"
            aria-level={4}
            className="min-w-0 truncate font-display text-[13px] leading-[18px] font-semibold tracking-[-0.01em] text-foreground"
          >
            {heading}
          </div>
          {phase === "interrupted" && pickWords && (
            <span className="shrink-0 truncate text-[11px] text-muted-foreground">
              {pickWords.label}{pickWords.levelText ? ` · ${pickWords.levelText}` : ""}
            </span>
          )}
        </div>
        <div
          role={running ? "status" : undefined}
          className={cn(
            "min-w-0 truncate text-[12px] leading-[17px]",
            running
              ? (waiting ? "text-warning" : "text-shimmer")
              : phase === "complete" || phase === "stopped"
                ? "text-muted-foreground"
                : "text-destructive",
          )}
        >
          {summaryLine}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
        {running ? (
          <>
            {waiting ? (
              <span className="font-medium text-warning">{meta.short}</span>
            ) : duration ? (
              <span className="font-medium text-brand">{duration}</span>
            ) : null}
            {child != null && (
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                disabled={cancelling}
                onClick={(e) => {
                  e.stopPropagation();
                  void cancel();
                }}
              >
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </>
        ) : phase === "interrupted" ? (
          <div onClick={(e) => e.stopPropagation()} className="flex items-center">
            {restart}
          </div>
        ) : (
          <>
            <span className={cn(phase === "failed" && "font-medium text-destructive")}>{meta.short}</span>
            {(finishedAt || duration) && (
              <span className="text-muted-foreground/75">{finishedAt ?? duration}</span>
            )}
          </>
        )}
        {href && (
          <CaretRight
            size={13}
            aria-hidden
            className="shrink-0 text-muted-foreground/70 transition-transform group-hover/sub:translate-x-0.5 group-hover/sub:text-foreground"
          />
        )}
      </div>
    </div>
  );

  return (
    <section aria-label="Subagent" data-phase={phase} className="my-2.5 flex w-full min-w-0 flex-col gap-1.5">
      <HoverCard>
        <HoverCardTrigger asChild>{bar}</HoverCardTrigger>
        <HoverCardContent side="top" align="center">
          <div className="flex flex-col gap-1.5">
            <div className="font-display text-[13px] leading-[18px] font-semibold break-words text-foreground">
              {heading}
            </div>
            {effectivePick && pickWords && (
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <ProviderMark provider={effectivePick.provider} className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">
                  {pickWords.label}{pickWords.levelText ? ` · ${pickWords.levelText}` : ""}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 text-xs font-medium tabular-nums">
              <span className={cn("inline-flex items-center gap-1.5", meta.tone)}>
                <StatusIcon size={13} weight="bold" className={cn("shrink-0", meta.spin && "animate-spin")} />
                {meta.label}
              </span>
              {duration && (
                <span className="font-normal text-muted-foreground">
                  {running ? `${duration} elapsed` : duration}
                </span>
              )}
            </div>
            {hoverSnippet && (
              <div className="mt-0.5 flex items-start gap-1.5 border-t border-border-subtle pt-2 text-xs leading-4 text-muted-foreground">
                <Terminal size={12} className="mt-0.5 shrink-0 opacity-70" />
                {typeof hoverSnippet === "string" ? (
                  <span className="min-w-0 flex-1 break-words line-clamp-3">{hoverSnippet}</span>
                ) : (
                  <span data-selectable className="min-w-0 flex-1 break-words whitespace-pre-wrap line-clamp-3">
                    {hoverSnippet.text}{hoverSnippet.more && <span> …</span>}
                  </span>
                )}
              </div>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>

      {cancelError && <CardCallout className="mx-0 my-0">{cancelError}</CardCallout>}
      {running && unstopped && openable && (
        <CardCallout className="mx-0 my-0">
          The subagent hasn’t stopped. <OpenChat child={child} title={thread?.title ?? null} className="underline" /> to force stop it.
        </CardCallout>
      )}
      {note && (
        <div className="flex min-w-0 items-start gap-1.5 px-3 text-xs leading-5 text-muted-foreground">
          <ArrowBendDownRight size={13} className="mt-0.75 shrink-0" />
          <span className="min-w-0 break-words">{note}</span>
        </div>
      )}
    </section>
  );
}
