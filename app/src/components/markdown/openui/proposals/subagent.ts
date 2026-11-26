import { fmtTime } from "@/lib/format/format";
import type { HarnessRun, PickerProvider, Provider, Selection } from "@/lib/harness";
import { liveRunId } from "@/lib/harness/runs";
import { object, type Row } from "./model";

/** `children::ONE_LEVEL` in Rust, word for word: why a card in a child chat cannot start. */
export const ONE_LEVEL = "This chat is a subagent itself, and a subagent cannot start another one.";

/** What the child runs on: the agent, model and level. */
export interface SubagentPick {
  provider: Provider;
  model: string | null;
  effort: string | null;
}

const name = (value: unknown) => typeof value === "string" && value.trim() ? value : null;

/** The card's selection: what the student set on it, else the parent chat's
 *  composer selection, which the pill shows until the student changes it. */
export function subagentPick(state: Row, parent: Selection): SubagentPick {
  const provider = name(state.provider) as Provider | null;
  if (!provider) return { provider: parent.provider, model: parent.model, effort: parent.effort };
  return { provider, model: name(state.model), effort: name(state.effort) };
}

const listed = (pick: SubagentPick, providers: PickerProvider[]) =>
  providers.find((p) => p.id === pick.provider)?.models.find((m) => m.id === pick.model);

/** Start may go once an agent, a model and a level are named and the
 *  agent's catalogue has loaded. For a model it lists, the level is one the
 *  model takes, or none when it takes none; a model it does not list goes
 *  with the level named, which the pill shows as it is. */
export function pickReady(pick: SubagentPick, providers: PickerProvider[]): boolean {
  const agent = providers.find((p) => p.id === pick.provider);
  if (!agent || agent.loading || agent.health === "missing" || !pick.model) return false;
  const model = listed(pick, providers);
  if (!model) return !!pick.effort;
  if (model.reasoningEfforts.length === 0) return !pick.effort;
  return !!pick.effort && model.reasoningEfforts.includes(pick.effort);
}

/** The pick with a level its listed model takes, as the model menu settles
 *  one on a model change: a level the model lacks becomes its default, or
 *  none. The CLI rejects a level its model doesn't take. */
export function fitLevel(pick: SubagentPick, providers: PickerProvider[]): SubagentPick {
  const model = listed(pick, providers);
  if (!model || (pick.effort && model.reasoningEfforts.includes(pick.effort))) return pick;
  if (!pick.effort && model.reasoningEfforts.length > 0) return pick;
  return { ...pick, effort: model.defaultReasoningEffort ?? model.reasoningEfforts[0] ?? null };
}

/** The card's state with the pick written in, as Start sends it to Rust. */
export const withPick = (state: Row, pick: SubagentPick): Row => ({ ...state, provider: pick.provider, model: pick.model, effort: pick.effort });

/** How a started card stands, from its persisted `job`. */
export type SubagentPhase = "running" | "complete" | "failed" | "stopped" | "interrupted";

export function subagentPhase(state: Row): SubagentPhase | null {
  const job = object(state.job);
  if (job.phase === "running") return "running";
  if (job.phase === "complete") return "complete";
  if (job.phase !== "error") return null;
  // A quit leaves `interrupted` (`proposal_jobs::reconcile`); a stop, the child's report.
  if (job.interrupted === true) return "interrupted";
  return job.ended === "interrupted" ? "stopped" : "failed";
}

/** The child's thread once Rust recorded it. */
export const childOf = (state: Row): number | null => {
  const child = object(state.job).child;
  return typeof child === "number" ? child : null;
};

/** A report's opening: its first `lines` non-empty lines, each kept whole. */
export function openingLines(text: string, lines = 3): { text: string; more: boolean } {
  const all = text.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim());
  return { text: all.slice(0, lines).join("\n"), more: all.length > lines };
}

/** One-line preview of a brief or report: the first non-empty line, trimmed. */
export function firstLine(text: unknown): string {
  if (typeof text !== "string") return "";
  return text.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

/** Clock time when a finished job ended ("3:36 pm"), or null if still live or reconciled. */
export function finishedTime(state: Row): string | null {
  const job = object(state.job);
  if (job.interrupted === true || typeof job.finished_at !== "string") return null;
  const ms = Date.parse(job.finished_at);
  return Number.isFinite(ms) ? fmtTime(ms) : null;
}

/** The running child's line: what its newest row is doing, else the last
 *  line of the answer streaming in, else that it is at work. */
export function liveLine(activity: string | null, streaming: string | undefined): string {
  if (activity) return activity;
  const last = streaming?.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  return last ?? "Working…";
}

/** The child's newest live run, the one Cancel stops; undefined once none is. */
export function liveRun(runs: Record<number, HarnessRun> | undefined): HarnessRun | undefined {
  const id = liveRunId(runs);
  return id == null ? undefined : runs?.[id];
}

/** What the child waits on, from the thread list's counts. */
export function waitingOn(thread: { pending_requests?: number; pending_questions?: number } | undefined): string | null {
  const requests = thread?.pending_requests ?? 0;
  const questions = thread?.pending_questions ?? 0;
  if (requests > questions) return "Waiting for approval";
  if (questions > 0) return "Waiting for an answer";
  return null;
}
