import { expect, test } from "bun:test";
import type { HarnessRun, PickerProvider } from "@/lib/harness";
import { STOP_PATIENCE_MS, stopDueAt, stopOverdue } from "@/lib/harness/runs";
import { finishedTime, firstLine, fitLevel, liveLine, liveRun, openingLines, pickReady, subagentPhase, subagentPick, waitingOn, withPick } from "@/components/markdown/openui/proposals/subagent";

const model = (id: string, reasoningEfforts: string[]) => ({ id, label: id, description: "", reasoningEfforts, defaultReasoningEffort: reasoningEfforts[0] ?? null });
const providers: PickerProvider[] = [
  { id: "codex", label: "Codex", models: [model("gpt-6.2-sol", ["low", "medium"]), model("flat", [])], health: "installed" },
  { id: "opencode", label: "opencode", models: [], health: "missing" },
];

test("the card opens on the parent's selection until the student picks on it", () => {
  const parent = { provider: "claude" as const, model: "sonnet", effort: "medium" };
  expect(subagentPick({ task: "x" }, parent)).toEqual(parent);
  const picked = withPick({ task: "x" }, { provider: "codex", model: "gpt-6.2-sol", effort: "low" });
  expect(subagentPick(picked, parent)).toEqual({ provider: "codex", model: "gpt-6.2-sol", effort: "low" });
});

test("Start waits for an agent, a model and a level, unless the model has no levels", () => {
  expect(pickReady({ provider: "codex", model: "gpt-6.2-sol", effort: "medium" }, providers)).toBe(true);
  expect(pickReady({ provider: "codex", model: "gpt-6.2-sol", effort: null }, providers)).toBe(false);
  expect(pickReady({ provider: "codex", model: "flat", effort: null }, providers)).toBe(true);
  expect(pickReady({ provider: "codex", model: null, effort: "low" }, providers)).toBe(false);
  // A model the catalogue has not listed is never assumed to need no level.
  expect(pickReady({ provider: "codex", model: "unlisted", effort: null }, providers)).toBe(false);
  expect(pickReady({ provider: "opencode", model: "m", effort: "low" }, providers)).toBe(false);
  expect(pickReady({ provider: "claude", model: "sonnet", effort: "low" }, providers)).toBe(false);
  // A listed model takes only its own levels, and one with none takes none.
  expect(pickReady({ provider: "codex", model: "gpt-6.2-sol", effort: "xhigh" }, providers)).toBe(false);
  expect(pickReady({ provider: "codex", model: "flat", effort: "medium" }, providers)).toBe(false);
  // An unlisted model keeps the rule: a named level is enough.
  expect(pickReady({ provider: "codex", model: "unlisted", effort: "xhigh" }, providers)).toBe(true);
  // Nothing is unlisted while the catalogue is still loading.
  const loading: PickerProvider[] = [{ id: "codex", label: "Codex", models: [], loading: true, health: "installed" }];
  expect(pickReady({ provider: "codex", model: "gpt-6.2-sol", effort: "xhigh" }, loading)).toBe(false);
});

test("a level the picked model doesn't take becomes its default, or none", () => {
  // The parent's level stays on the card when only the model changes.
  expect(fitLevel({ provider: "codex", model: "flat", effort: "medium" }, providers)).toEqual({ provider: "codex", model: "flat", effort: null });
  expect(fitLevel({ provider: "codex", model: "gpt-6.2-sol", effort: "xhigh" }, providers)).toEqual({ provider: "codex", model: "gpt-6.2-sol", effort: "low" });
  const kept = { provider: "codex" as const, model: "gpt-6.2-sol", effort: "medium" };
  expect(fitLevel(kept, providers)).toBe(kept);
  const unchosen = { provider: "codex" as const, model: "gpt-6.2-sol", effort: null };
  expect(fitLevel(unchosen, providers)).toBe(unchosen);
  const unlisted = { provider: "codex" as const, model: "unlisted", effort: "xhigh" };
  expect(fitLevel(unlisted, providers)).toBe(unlisted);
  for (const pick of [fitLevel({ provider: "codex", model: "flat", effort: "medium" }, providers), fitLevel({ provider: "codex", model: "gpt-6.2-sol", effort: "xhigh" }, providers)]) {
    expect(pickReady(pick, providers)).toBe(true);
  }
});

test("a started card reads its phase from the job Rust saved", () => {
  expect(subagentPhase({})).toBeNull();
  expect(subagentPhase({ job: { phase: "running" } })).toBe("running");
  expect(subagentPhase({ job: { phase: "complete" } })).toBe("complete");
  expect(subagentPhase({ job: { phase: "error", ended: "failed" } })).toBe("failed");
  expect(subagentPhase({ job: { phase: "error", ended: "interrupted" } })).toBe("stopped");
  expect(subagentPhase({ job: { phase: "error", interrupted: true } })).toBe("interrupted");
});

test("the running line, what the child waits on, and the report's opening", () => {
  expect(liveLine("Reading week-3.pdf", "an answer")).toBe("Reading week-3.pdf");
  expect(liveLine(null, "First line\nSecond line\n")).toBe("Second line");
  expect(liveLine(null, undefined)).toBe("Working…");
  expect(waitingOn({ pending_requests: 1, pending_questions: 0 })).toBe("Waiting for approval");
  expect(waitingOn({ pending_requests: 1, pending_questions: 1 })).toBe("Waiting for an answer");
  expect(waitingOn({})).toBeNull();
  expect(openingLines("a\n\nb\nc\nd")).toEqual({ text: "a\nb\nc", more: true });
  expect(openingLines("only")).toEqual({ text: "only", more: false });
  expect(firstLine("\n  First line  \nSecond")).toBe("First line");
  expect(firstLine("")).toBe("");
  expect(finishedTime({ job: { phase: "complete", finished_at: "2026-11-01T04:36:00Z" } })).toBeTruthy();
  expect(finishedTime({ job: { phase: "error", interrupted: true, finished_at: "2026-11-01T04:36:00Z" } })).toBeNull();
});

test("a cancel the child has not answered is overdue by the chat's own Stop measure", () => {
  const run = (id: number, extra: Partial<HarnessRun>): HarnessRun => ({ id, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, ...extra });
  const asked = 1_000;
  const runs = { 1: run(1, { stopping: true, stop_requested_ms: asked }), 0: run(0, { status: "completed", ended_ms: 500 }) };
  const live = liveRun(runs);
  expect(live?.id).toBe(1);
  expect(stopOverdue(live, asked + 1_000)).toBe(false);
  expect(stopDueAt(live)).toBe(asked + STOP_PATIENCE_MS);
  expect(stopOverdue(live, asked + STOP_PATIENCE_MS)).toBe(true);
  // Rust saying the CLI never answered needs no wait.
  expect(stopOverdue(liveRun({ 1: run(1, { stopping: true, stop_requested_ms: asked, unresponsive: { others: 0 } }) }), asked)).toBe(true);
  // A run that ended is not live: nothing is left to stop.
  expect(liveRun({ 1: run(1, { status: "interrupted", ended_ms: 2_000 }) })).toBeUndefined();
  expect(liveRun(undefined)).toBeUndefined();
});
