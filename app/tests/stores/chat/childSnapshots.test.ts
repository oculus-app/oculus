import { afterEach, expect, spyOn, test } from "bun:test";
import type Database from "@tauri-apps/plugin-sql";
import * as db from "@/lib/db";
import type { HarnessThread } from "@/lib/harness";
import { proposalApi, type Proposal } from "@/lib/harness/proposals";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { createProposalStore } from "@/stores/chat/proposalStore";

const child: HarnessThread = {
  id: 602, parent_id: 601, provider: "claude", provider_session_id: null, model: "sonnet",
  title: "Read the slides", subject_id: null, lecture_id: null, usage: null, status: "running",
  created_at: "2026-11-01 00:00:00", updated_at: "2026-11-01 00:00:00", pending_requests: 0,
};
const prior = useHarnessStore.getState();
afterEach(() => useHarnessStore.setState(prior, true));

test("removing the parent immediately clears its id on the surviving child", () => {
  useHarnessStore.setState({ threads: [{ ...child, id: 601, parent_id: null }, child] });
  useHarnessStore.getState().removed(601);
  expect(useHarnessStore.getState().threads.map(t => [t.id, t.parent_id])).toEqual([[602, null]]);
});

test("a repeat adoption read cannot erase approval received after the child was listed", async () => {
  const first = Promise.withResolvers<HarnessThread[]>();
  const second = Promise.withResolvers<HarnessThread[]>();
  const readingAgain = Promise.withResolvers<void>();
  const selects = [() => first.promise, () => { readingAgain.resolve(); return second.promise; }];
  const read = spyOn(db, "getDb").mockResolvedValue({ select: () => selects.shift()!() } as unknown as Database);
  try {
    useHarnessStore.setState({ threads: [], live: {}, threadsLoaded: true });
    const apply = useHarnessStore.getState().apply;
    const envelope = { threadId: child.id, provider: child.provider };
    apply({ ...envelope, event: { type: "user_message", text: "Read the slides" } });
    apply({ ...envelope, event: { type: "thread_titled", title: child.title! } });
    first.resolve([child]);
    await readingAgain.promise;
    apply({ ...envelope, event: { type: "request_opened", waiting: 1, request: {
      id: 1, thread_id: child.id, run_id: 1, item_id: 2, provider: child.provider,
      kind: "approval", action: "command", payload: {}, options: [], status: "pending",
      responder: "live", reason: null, response: null, delivery: "none", created_at: child.created_at, resolved_at: null,
    } } });
    expect(useHarnessStore.getState().threads[0].pending_requests).toBe(1);
    second.resolve([child]);
    await Bun.sleep(0);
    expect(useHarnessStore.getState().threads[0].pending_requests).toBe(1);
  } finally {
    read.mockRestore();
  }
});

test("a late open response from before Start again cannot restore the previous child", async () => {
  const old: Proposal = {
    id: "4.0", item_id: 4, block: 0, thread_id: 601, kind: "Subagent", status: "created", made: [], told: null,
    updated_at: "2026-11-01T00:01:00.000Z",
    state: { job: { phase: "error", interrupted: true, child: 602, started_at: "2026-11-01T00:00:00Z" } },
  };
  const running: Proposal = { ...old, updated_at: "2026-11-01T00:02:00.000Z",
    state: { job: { phase: "running", child: 603, started_at: "2026-11-01T00:02:00Z" } } };
  const snapshot = Promise.withResolvers<Proposal>();
  const store = createProposalStore({ ...proposalApi, open: () => snapshot.promise });
  store.getState().receive(old);
  const open = store.getState().open(601, 4, 0, "Subagent", {});
  store.getState().receive(running);
  snapshot.resolve(old);
  await open;
  expect(store.getState().rows["4.0"].state.job).toEqual(running.state.job);
});

test("the first list read retains a child whose start arrived while it was pending", async () => {
  const page = Promise.withResolvers<HarnessThread[]>();
  const readingPage = Promise.withResolvers<void>();
  const read = spyOn(db, "getDb").mockResolvedValue({
    select: async (sql: string) => {
      if (sql.includes("WHERE t.id IN")) return [child];
      readingPage.resolve();
      return page.promise;
    },
  } as unknown as Database);
  try {
    useHarnessStore.setState({ threads: [], threadsLoaded: false, holds: {}, live: {} });
    const list = useHarnessStore.getState().loadThreads();
    await readingPage.promise;
    useHarnessStore.getState().apply({ threadId: child.id, provider: child.provider,
      event: { type: "user_message", text: "Read the slides" } });
    page.resolve([]);
    await list;
    await Bun.sleep(0);
    expect(useHarnessStore.getState().threads.map(t => t.id)).toContain(child.id);
  } finally {
    read.mockRestore();
  }
});

const parent: HarnessThread = { ...child, id: 601, parent_id: null, title: "Week 3", status: "idle" };
const approval = {
  type: "request_opened" as const, waiting: 1, request: {
    id: 1, thread_id: child.id, run_id: 1, item_id: 2, provider: child.provider,
    kind: "approval" as const, action: "command", payload: {}, options: [], status: "pending" as const,
    responder: "live" as const, reason: null, response: null, delivery: "none" as const, created_at: child.created_at, resolved_at: null,
  },
};

/** The list read's page waits on `page`; reads by id answer `byId`. */
function mockReads(page: Promise<HarnessThread[]>, byId: (sql: string) => Promise<HarnessThread[]> | HarnessThread[] = () => []) {
  const reading = Promise.withResolvers<void>();
  const spy = spyOn(db, "getDb").mockResolvedValue({
    select: async (sql: string) => {
      if (sql.includes("WHERE t.id IN")) return byId(sql);
      reading.resolve();
      return page;
    },
  } as unknown as Database);
  return { reading: reading.promise, spy };
}

test("a second list read cannot erase an approval that arrived during it", async () => {
  const page = Promise.withResolvers<HarnessThread[]>();
  const { reading, spy } = mockReads(page.promise);
  try {
    useHarnessStore.setState({ threads: [parent, child], threadsLoaded: true, holds: {}, live: {} });
    const list = useHarnessStore.getState().loadThreads();
    await reading;
    useHarnessStore.getState().apply({ threadId: child.id, provider: child.provider, event: approval });
    page.resolve([parent, child]);
    await list;
    expect(useHarnessStore.getState().threads.find(t => t.id === child.id)?.pending_requests).toBe(1);
  } finally {
    spy.mockRestore();
  }
});

test("a child started during a second list read stays listed", async () => {
  const page = Promise.withResolvers<HarnessThread[]>();
  const { reading, spy } = mockReads(page.promise, () => [child]);
  try {
    useHarnessStore.setState({ threads: [parent], threadsLoaded: true, holds: {}, live: {} });
    const list = useHarnessStore.getState().loadThreads();
    await reading;
    useHarnessStore.getState().apply({ threadId: child.id, provider: child.provider,
      event: { type: "user_message", text: "Read the slides" } });
    await Bun.sleep(0);
    expect(useHarnessStore.getState().threads.map(t => t.id)).toContain(child.id);
    page.resolve([parent]);
    await list;
    await Bun.sleep(0);
    expect(useHarnessStore.getState().threads.map(t => t.id)).toEqual([parent.id, child.id]);
  } finally {
    spy.mockRestore();
  }
});

test("a list read drops a thread deleted during it and unparents its child", async () => {
  const page = Promise.withResolvers<HarnessThread[]>();
  const { reading, spy } = mockReads(page.promise);
  try {
    useHarnessStore.setState({ threads: [parent, child], threadsLoaded: true, holds: {}, live: {} });
    const list = useHarnessStore.getState().loadThreads();
    await reading;
    useHarnessStore.getState().removed(parent.id);
    page.resolve([parent, child]);
    await list;
    expect(useHarnessStore.getState().threads.map(t => [t.id, t.parent_id])).toEqual([[child.id, null]]);
  } finally {
    spy.mockRestore();
  }
});

test("an adoption read neither brings back a thread deleted during it nor its deleted parent", async () => {
  const rows = [Promise.withResolvers<HarnessThread[]>(), Promise.withResolvers<HarnessThread[]>()];
  const asked = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  let n = 0;
  const { spy } = mockReads(Promise.resolve([]), () => {
    asked[n].resolve();
    return rows[n++].promise;
  });
  const other: HarnessThread = { ...child, id: 603 };
  try {
    useHarnessStore.setState({ threads: [parent], threadsLoaded: true, holds: {}, live: {} });
    const { apply, removed } = useHarnessStore.getState();
    apply({ threadId: other.id, provider: other.provider, event: { type: "user_message", text: "Go" } });
    await asked[0].promise;
    removed(other.id);
    rows[0].resolve([other]);
    await Bun.sleep(0);
    expect(useHarnessStore.getState().threads.map(t => t.id)).toEqual([parent.id]);

    apply({ threadId: child.id, provider: child.provider, event: { type: "user_message", text: "Read the slides" } });
    await asked[1].promise;
    removed(parent.id);
    rows[1].resolve([child]);
    await Bun.sleep(0);
    expect(useHarnessStore.getState().threads.map(t => [t.id, t.parent_id])).toEqual([[child.id, null]]);
  } finally {
    spy.mockRestore();
  }
});

test("a model chosen during a list read survives it", async () => {
  const page = Promise.withResolvers<HarnessThread[]>();
  const { reading, spy } = mockReads(page.promise);
  try {
    useHarnessStore.setState({ threads: [parent], threadsLoaded: true, holds: {}, live: {} });
    const list = useHarnessStore.getState().loadThreads();
    await reading;
    useHarnessStore.getState().selected(parent.id, { provider: "codex", model: "gpt-6.2-sol", effort: "high" });
    page.resolve([parent]);
    await list;
    const row = useHarnessStore.getState().threads[0];
    expect([row.provider, row.model, row.effort]).toEqual(["codex", "gpt-6.2-sol", "high"]);
  } finally {
    spy.mockRestore();
  }
});
