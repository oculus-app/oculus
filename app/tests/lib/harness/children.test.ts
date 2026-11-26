import { describe, expect, test } from "bun:test";
import { agentState, byNewestStarted, nestChildren } from "@/lib/harness/children";

const t = (id: number, parent_id: number | null = null) => ({ id, parent_id });

describe("nestChildren", () => {
  test("a child whose parent is listed leaves the top level for its parent", () => {
    const { top, children } = nestChildren([t(5, 1), t(4), t(3, 1), t(1)]);
    expect(top.map((x) => x.id)).toEqual([4, 1]);
    expect(children.get(1)?.map((x) => x.id)).toEqual([5, 3]);
    expect(children.has(4)).toBe(false);
  });

  test("a child whose parent is not loaded, or was deleted (null), is an ordinary chat", () => {
    const { top, children } = nestChildren([t(9, 77), t(8, null), t(2)]);
    expect(top.map((x) => x.id)).toEqual([9, 8, 2]);
    expect(children.size).toBe(0);
  });

  test("one level deep: a child of a child is listed at the top", () => {
    const { top, children } = nestChildren([t(1), t(2, 1), t(3, 2)]);
    expect(top.map((x) => x.id)).toEqual([1, 3]);
    expect(children.get(1)?.map((x) => x.id)).toEqual([2]);
    expect(children.has(2)).toBe(false);
  });

  test("a thread naming itself is not its own child", () => {
    expect(nestChildren([t(4, 4)]).top.map((x) => x.id)).toEqual([4]);
  });
});

describe("agentState", () => {
  const quiet = { status: "idle" as const, pending_requests: 0, pending_questions: 0, last_run: null };

  test("a request waiting on the student comes first, then a question, then a run", () => {
    expect(agentState({ ...quiet, pending_requests: 1 }, true)).toBe("approval");
    expect(agentState({ ...quiet, pending_requests: 1, pending_questions: 1 }, true)).toBe("input");
    expect(agentState({ ...quiet, last_run: "completed" }, true)).toBe("working");
  });

  test("a settled child says how its latest run ended", () => {
    expect(agentState({ ...quiet, last_run: "completed" }, false)).toBe("done");
    expect(agentState({ ...quiet, last_run: "interrupted" }, false)).toBe("stopped");
    expect(agentState({ ...quiet, last_run: "failed" }, false)).toBe("failed");
    expect(agentState({ ...quiet, status: "error" }, false)).toBe("failed");
  });

  test("a child with no run yet has not started", () => {
    expect(agentState(quiet, false)).toBe("waiting");
  });
});

test("byNewestStarted orders by creation, then id", () => {
  const rows = [
    { id: 1, created_at: "2026-11-20 10:00:00" },
    { id: 2, created_at: "2026-11-21 10:00:00" },
    { id: 3, created_at: "2026-11-20 10:00:00" },
  ];
  expect(byNewestStarted(rows).map((r) => r.id)).toEqual([2, 3, 1]);
});
