import type { ActiveRender } from "@/stores/studio/renderStore";
import type { StudioAction } from "./activity";
import type { RenderPreset } from "./render";
import type { VideoDetail } from "./videos";

/**
 * Where a video being made in a chat is, for its card and its Thread info
 * row: one status line and five steps (Script, Scenes, Narration, Draft,
 * Final). Files say what is done; the call running now, or a turn that is
 * working on this video, says what is happening; a failure shows only once
 * the agent has stopped, since while it works it is still dealing with it.
 */

export type StepName = "Script" | "Scenes" | "Narration" | "Draft" | "Final";
export type StepState = "done" | "active" | "pending" | "failed";

export interface VideoStep {
  name: StepName;
  state: StepState;
  note: string;
  /** Seconds since the epoch the step's file was last written. */
  when?: number | null;
}

export interface VideoProgress {
  label: string;
  tone: "muted" | "busy" | "ok" | "bad";
  /** 0 to 1 while scenes build or a render reports its progress. */
  fraction: number | null;
  /** A render runs without a known fraction: the bar sweeps. */
  sweeping: boolean;
  steps: VideoStep[];
}

export interface ProgressInput {
  /** The last detail read; it may be older than `readError`. */
  detail: VideoDetail | null;
  /** The thread's agent is working. */
  running: boolean;
  /** Its turn has touched this video (`touchesVideo`): the next step is
   *  what it is doing. A turn on something else leaves the card still. */
  working?: boolean;
  /** A render the app started (`renderStore`). */
  render?: ActiveRender;
  /** Why the latest read of the detail failed. */
  readError?: string | null;
  /** The app's last render of the video failed, and which preset it was. */
  renderFailure?: { message: string; preset: RenderPreset } | null;
  /** The thread's latest Studio call on this video (`lastStudioAction`). */
  last?: { action: StudioAction; live: boolean } | null;
}

const SCRIPT = 0;
const SCENES = 1;
const NARRATION = 2;
const DRAFT = 3;
const FINAL = 4;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const percent = (f: number | null | undefined) => (f != null ? ` · ${Math.round(f * 100)}%` : "");

/** A render or narrate call's step; anything else is building scenes. */
function stepOf(action: StudioAction): number {
  if (action.action === "render") return action.preset === "final" ? FINAL : DRAFT;
  if (action.action === "narrate") return NARRATION;
  return SCENES;
}

export function videoProgress({ detail, running, working = false, render, readError, renderFailure, last }: ProgressInput): VideoProgress {
  const scenes = detail?.scenes ?? [];
  const total = scenes.length;
  const built = scenes.filter((s) => s.built !== false).length;
  const scripted = total > 0 && scenes.some((s) => !!s.text);
  const stale = !!detail?.row.narrated && !!detail.timingProblem;
  const narrated = !!detail?.row.narrated && !stale;
  const draft = detail?.renders.find((r) => r.preset === "draft");
  const final = detail?.renders.find((r) => r.preset === "final");

  const steps: VideoStep[] = [
    {
      name: "Script",
      state: scripted ? "done" : "pending",
      note: scripted ? plural(total, "scene") : "Not written yet",
      when: scripted ? detail?.scriptModified : null,
    },
    {
      name: "Scenes",
      state: total > 0 && built === total ? "done" : "pending",
      note: total > 0 ? `${built} of ${total} built` : "Waiting for the script",
    },
    {
      name: "Narration",
      state: narrated ? "done" : "pending",
      note: narrated ? "Narrated" : stale ? "The script changed after it was narrated" : "Not narrated yet",
      when: narrated ? detail?.narrationModified : null,
    },
    { name: "Draft", state: draft ? "done" : "pending", note: draft ? "Rendered" : "Not rendered yet", when: draft?.modified },
    {
      name: "Final",
      state: final ? "done" : "pending",
      note: final ? "Rendered" : "The agent asks before rendering it",
      when: final?.modified,
    },
  ];
  const next = steps.findIndex((s, i) => i < FINAL && s.state !== "done");

  const busy = (at: number, label: string, fraction: number | null = null, sweeping = false): VideoProgress => {
    steps[at] = { ...steps[at], state: "active", note: label, when: null };
    return { label, tone: "busy", fraction, sweeping, steps };
  };

  if (render) {
    const at = render.preset === "final" ? FINAL : DRAFT;
    return busy(at, `Rendering ${render.preset}${percent(render.fraction)}`, render.fraction, render.fraction == null);
  }
  if (last?.live) {
    const at = stepOf(last.action);
    if (at >= DRAFT) return busy(at, `Rendering ${last.action.preset === "final" ? "final" : "draft"}`, null, true);
    if (at === NARRATION) return busy(at, "Narrating");
    if (next === SCENES || next === SCRIPT) {
      return busy(SCENES, `Building scenes · ${built} of ${total}`, total > 0 ? built / total : null);
    }
  }

  if (!running) {
    if (readError) return { label: "Can't read the video", tone: "bad", fraction: null, sweeping: false, steps };
    const failedCall = last && last.action.ok === false ? last.action : null;
    const failure = failedCall
      ? { at: stepOf(failedCall), message: failedCall.output?.trim() || `oculus studio ${failedCall.action} failed` }
      : renderFailure
        ? { at: renderFailure.preset === "final" ? FINAL : DRAFT, message: renderFailure.message }
        : null;
    if (failure) {
      const { at, message } = failure;
      steps[at] = { ...steps[at], state: "failed", note: message, when: null };
      return { label: `${steps[at].name} failed`, tone: "bad", fraction: null, sweeping: false, steps };
    }
  }

  if (final) return { label: "Final ready", tone: "ok", fraction: null, sweeping: false, steps };
  if (draft && next < 0) return { label: "Draft ready", tone: "ok", fraction: null, sweeping: false, steps };
  if (running && working && next >= 0) {
    const label = [
      "Writing the script",
      `Building scenes · ${built} of ${total}`,
      "Narrating",
      "Rendering draft",
    ][next];
    return busy(next, label, next === SCENES && total > 0 ? built / total : null);
  }
  if (draft) return { label: "Draft ready", tone: "ok", fraction: null, sweeping: false, steps };
  const waiting = next < 0 ? "Not rendered yet" : next === NARRATION && stale ? "Narration out of date" : steps[next].note;
  return { label: waiting, tone: "muted", fraction: null, sweeping: false, steps };
}
