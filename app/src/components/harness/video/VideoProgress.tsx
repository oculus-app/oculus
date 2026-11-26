import { useState, type ReactNode } from "react";
import { CaretRight, Check, CircleNotch, Play, X } from "@phosphor-icons/react";

import { fmtAgo } from "@/lib/format/format";
import type { StepName, VideoStep } from "@/lib/studio/progress";
import type { VideoDetail } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";
import { InlineVideo, type PlayRequest } from "./InlineVideo";
import { StepNarration } from "./StepNarration";
import { StepScript } from "./StepScript";
import { Storyboard } from "./Storyboard";

export type RenderStep = "Draft" | "Final";

/** A step's mark: a filled check, the brand spinner, a red cross, or an
 *  empty ring still to come. */
function Mark({ state }: { state: VideoStep["state"] }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-[18px] items-center justify-center rounded-full border-[1.5px] bg-card",
        state === "done" && "border-transparent bg-success text-primary-foreground",
        state === "failed" && "border-transparent bg-destructive text-destructive-foreground",
        state === "active" && "border-brand",
        state === "pending" && "border-border",
      )}
    >
      {state === "done" ? (
        <Check size={11} weight="bold" />
      ) : state === "failed" ? (
        <X size={11} weight="bold" />
      ) : state === "active" ? (
        <CircleNotch size={11} className="animate-spin text-brand" />
      ) : null}
    </span>
  );
}

/**
 * The card's progress timeline: Script, Scenes, Narration, Draft, Final,
 * each with when it finished or what it is doing now, and the artifact that
 * step produced nested directly inside it (the script, the storyboard, the
 * narration timings, and the draft or final inline player).
 */
export function VideoProgress({
  steps,
  detail,
  activeRender,
  onToggleRender,
  onPlayAt,
  onOpenBeside,
}: {
  steps: VideoStep[];
  detail: VideoDetail | null;
  /** Which render step's player is open, and where to play from. */
  activeRender: { step: RenderStep; request: PlayRequest } | null;
  onToggleRender: (step: RenderStep) => void;
  /** Opens the newest available render step and plays from `at`. */
  onPlayAt: (at: number) => void;
  onOpenBeside: () => void;
}) {
  const [openSteps, setOpenSteps] = useState<Partial<Record<StepName, boolean>>>({});
  const toggleStep = (name: StepName) => setOpenSteps((prev) => ({ ...prev, [name]: !prev[name] }));

  const hasScript = !!detail && detail.scenes.some((s) => !!s.text);
  const hasScenes = !!detail && detail.scenes.length > 0;
  const hasNarration = !!detail && detail.row.narrated && !detail.timingProblem && detail.scenes.some((s) => s.duration != null);
  const hasDraft = !!detail && detail.renders.some((r) => r.preset === "draft");
  const hasFinal = !!detail && detail.renders.some((r) => r.preset === "final");
  const playable = hasDraft || hasFinal;

  return (
    <ol aria-label="Progress" className="flex flex-col">
      {steps.map((s, i) => {
        const renderStep: RenderStep | null = s.name === "Draft" || s.name === "Final" ? s.name : null;
        const canOpen =
          (s.name === "Script" && hasScript) ||
          (s.name === "Scenes" && hasScenes) ||
          (s.name === "Narration" && hasNarration) ||
          (s.name === "Draft" && hasDraft) ||
          (s.name === "Final" && hasFinal);
        const isOpen = canOpen && (renderStep ? activeRender?.step === renderStep : !!openSteps[s.name]);
        const onToggle = () => {
          if (renderStep) onToggleRender(renderStep);
          else toggleStep(s.name);
        };

        let nested: ReactNode = null;
        if (isOpen && detail) {
          if (s.name === "Script") {
            nested = <StepScript detail={detail} />;
          } else if (s.name === "Scenes") {
            nested = (
              <div className="rounded-lg border border-border-subtle bg-surface/50 p-3">
                <Storyboard detail={detail} playable={playable} onPlay={onPlayAt} />
              </div>
            );
          } else if (s.name === "Narration") {
            nested = <StepNarration detail={detail} playable={playable} onPlayAt={onPlayAt} />;
          } else if ((s.name === "Draft" || s.name === "Final") && activeRender?.step === s.name) {
            const preset = s.name === "Final" ? "final" : "draft";
            nested = (
              <InlineVideo
                key={`${detail.row.slug}:${preset}`}
                detail={detail}
                request={activeRender.request}
                preset={preset}
                onOpenBeside={onOpenBeside}
              />
            );
          }
        }

        const time =
          s.state === "done" && s.when != null ? (
            <time className="text-xs whitespace-nowrap text-muted-foreground tabular-nums" dateTime={new Date(s.when * 1000).toISOString()}>
              {fmtAgo(s.when * 1000)}
            </time>
          ) : null;

        return (
          <li key={s.name} className="relative grid grid-cols-[18px_1fr] gap-x-2.5 pb-3.5 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute top-5 bottom-0.5 left-[8.5px] w-px bg-border" />}
            <Mark state={s.state} />
            <div className="min-w-0">
              {canOpen ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={onToggle}
                  className="group -mx-1.5 -my-1 flex w-[calc(100%+0.75rem)] cursor-pointer items-start justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  <div className="min-w-0 text-[13px]">
                    <div className={cn("flex items-center gap-1 font-medium", s.state === "pending" && "font-normal text-muted-foreground")}>
                      <span>{s.name}</span>
                      {!renderStep && (
                        <CaretRight
                          size={11}
                          weight="bold"
                          className={cn(
                            "shrink-0 text-muted-foreground transition-transform will-change-transform group-hover:text-foreground",
                            isOpen && "rotate-90 text-foreground",
                          )}
                        />
                      )}
                    </div>
                    <p className={cn("text-[12.5px] break-words text-muted-foreground", s.state === "failed" && "text-destructive")}>
                      {s.note}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    {renderStep && (
                      <span
                        className={cn(
                          "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium transition-colors",
                          isOpen
                            ? "border-brand/30 bg-brand-muted text-brand"
                            : "border-border bg-card text-foreground/85 group-hover:bg-accent group-hover:text-foreground",
                        )}
                      >
                        {isOpen ? <X size={11} weight="bold" /> : <Play size={11} weight="fill" />}
                        {isOpen ? "Close" : "Play"}
                      </span>
                    )}
                    {time}
                  </div>
                </button>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-[13px]">
                    <div className={cn("font-medium", s.state === "pending" && "font-normal text-muted-foreground")}>{s.name}</div>
                    <p className={cn("text-[12.5px] break-words text-muted-foreground", s.state === "failed" && "text-destructive")}>
                      {s.note}
                    </p>
                  </div>
                  {time && <div className="shrink-0">{time}</div>}
                </div>
              )}
              {nested && <div className="mt-2.5">{nested}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
