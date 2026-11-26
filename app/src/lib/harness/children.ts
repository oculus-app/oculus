import { sqliteUtcToMs } from "@/lib/format/format";
import type { HarnessThread } from "./types";

/**
 * Subagents as the webview draws them: a child chat (`parent_id`) is listed
 * under its parent, and thread info says what each one is doing
 * (docs/harness.md, "Subagents are child chats").
 */

export interface Nested<T> {
  /** The threads listed at the top level, in the order given. */
  top: T[];
  /** Each listed parent's children, in the order given. */
  children: Map<number, T[]>;
}

/** Splits a list into its top level and each parent's children. A thread
 *  nests only under a parent in the same list that is not itself nested, so
 *  a child whose parent is not loaded or was deleted is an ordinary chat. */
export function nestChildren<T extends { id: number; parent_id?: number | null }>(threads: readonly T[]): Nested<T> {
  const ids = new Set(threads.map((t) => t.id));
  const nestsUnder = (t: T) => t.parent_id != null && t.parent_id !== t.id && ids.has(t.parent_id);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const top: T[] = [];
  const children = new Map<number, T[]>();
  for (const t of threads) {
    const parent = nestsUnder(t) ? byId.get(t.parent_id!) : undefined;
    // One level deep: a child of a child is listed as a chat of its own.
    if (!parent || nestsUnder(parent)) {
      top.push(t);
      continue;
    }
    const list = children.get(parent.id);
    if (list) list.push(t);
    else children.set(parent.id, [t]);
  }
  return { top, children };
}

/** What a child is doing, as thread info's Agents group says it. */
export type AgentState = "approval" | "input" | "working" | "failed" | "stopped" | "done" | "waiting";

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  approval: "Waiting for approval",
  input: "Waiting for your answer",
  working: "Working",
  failed: "Failed",
  stopped: "Stopped",
  done: "Done",
  waiting: "Not started",
};

/** A child's state from its list row: what waits on the student, then a run
 *  in flight, then how its latest run ended. Unlike a row's status, Done is
 *  how the work ended, not whether it was read. */
export function agentState(
  t: Pick<HarnessThread, "status" | "pending_requests" | "pending_questions" | "last_run">,
  running: boolean,
): AgentState {
  const questions = t.pending_questions ?? 0;
  if ((t.pending_requests ?? 0) > questions) return "approval";
  if (questions > 0) return "input";
  if (running) return "working";
  if (t.last_run === "failed" || t.status === "error") return "failed";
  if (t.last_run === "interrupted") return "stopped";
  if (t.last_run === "completed") return "done";
  return "waiting";
}

/** Newest first by when each child was started, then by id. */
export function byNewestStarted<T extends Pick<HarnessThread, "id" | "created_at">>(threads: readonly T[]): T[] {
  return threads
    .slice()
    .sort((a, b) => (sqliteUtcToMs(b.created_at) ?? 0) - (sqliteUtcToMs(a.created_at) ?? 0) || b.id - a.id);
}
