import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import type { HarnessEnvelope, HarnessItem, HarnessRun } from "@/lib/harness";

const dom = parseHTML("<!doctype html><html><body></body></html>");
const noopObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const globals = {
  window: dom.window,
  document: dom.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
  MutationObserver: noopObserver,
  IntersectionObserver: noopObserver,
  ResizeObserver: noopObserver,
  getComputedStyle: () => ({ getPropertyValue: () => "", overflowY: "visible" }),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  IS_REACT_ACT_ENVIRONMENT: true,
};
const previous = Object.getOwnPropertyDescriptors(globalThis);

let createRoot: typeof import("react-dom/client").createRoot;
let Timeline: typeof import("@/components/harness/timeline/Timeline").Timeline;
let TooltipProvider: typeof import("@/components/ui/tooltip").TooltipProvider;
let useHarnessStore: typeof import("@/stores/chat/harnessStore").useHarnessStore;
let itemsFor: typeof import("@/stores/chat/harnessStore").itemsFor;
const spies: { mockRestore(): void }[] = [];

let root: Root;
let host: HTMLDivElement;

const THREAD = 42;
const KIT_BASE = "http://127.0.0.1:4321/widget-kit/";
const COMPILED = { js: "function Phase() { return null; }\nconst __oculusWidget = Phase;\n", pending: [] as string[] };
const WIDGET_REPLY = [
  "Here is the phase circle:",
  "",
  "```widget",
  "// title: Phase circle",
  "export default function Phase() { return null; }",
  "```",
].join("\n");

beforeAll(async () => {
  Object.assign(globalThis, globals);
  Object.assign(dom.window, {
    getComputedStyle: globals.getComputedStyle,
    matchMedia: globals.matchMedia,
    MutationObserver: noopObserver,
    IntersectionObserver: noopObserver,
    ResizeObserver: noopObserver,
  });
  mockIPC((cmd) => {
    if (cmd === "harness_capabilities") return [];
    if (cmd === "harness_provider_models") return [];
    if (cmd === "harness_sign_in_status") return { provider: "claude", signedIn: true, account: null };
    return null;
  });
  const kit = await import("@/components/markdown/widget/kit");
  const transpileMod = await import("@/components/markdown/widget/transpile");
  spies.push(
    spyOn(kit, "knownKitBase").mockReturnValue(KIT_BASE),
    spyOn(kit, "widgetKitBase").mockResolvedValue(KIT_BASE),
    spyOn(transpileMod, "transpile").mockResolvedValue(COMPILED),
    spyOn(transpileMod, "transpilePreview").mockResolvedValue(COMPILED),
  );
  ({ createRoot } = await import("react-dom/client"));
  ({ Timeline } = await import("@/components/harness/timeline/Timeline"));
  ({ TooltipProvider } = await import("@/components/ui/tooltip"));
  ({ useHarnessStore, itemsFor } = await import("@/stores/chat/harnessStore"));
});

beforeEach(() => {
  useHarnessStore.getState().flushLive();
  useHarnessStore.getState().removed(THREAD);
  useHarnessStore.setState({
    threads: [],
    items: { [THREAD]: [] },
    runs: { [THREAD]: {} },
    live: {},
    holds: { [THREAD]: 1 },
    queued: {},
    requests: {},
    contextDrift: {},
  });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  useHarnessStore.getState().removed(THREAD);
});

afterAll(() => {
  for (const s of spies.splice(0)) s.mockRestore();
  clearMocks();
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function LiveTimeline({ threadId }: { threadId: number }) {
  const items = useHarnessStore((s) => itemsFor(threadId, s.items));
  const running = useHarnessStore((s) => s.live[threadId]?.running ?? false);
  return (
    <TooltipProvider>
      <Timeline items={items} threadId={threadId} running={running} />
    </TooltipProvider>
  );
}

const at = (s: number) => `2026-11-21 10:00:${String(s).padStart(2, "0")}`;

function item(id: number, kind: HarnessItem["kind"], run: number, patch: Partial<HarnessItem> = {}): HarnessItem {
  return {
    id,
    thread_id: THREAD,
    kind,
    ref_id: null,
    content: kind === "user" ? `question ${id}` : kind === "tool" ? "ls" : `reply ${id}`,
    meta: kind === "tool" ? JSON.stringify({ kind: "bash", name: "Bash", input: { command: "ls" }, ok: true }) : null,
    created_at: at(id),
    run_id: run,
    ...patch,
  };
}

function env(runId: number, itemId: number | null, event: HarnessEnvelope["event"]): HarnessEnvelope {
  return { threadId: THREAD, provider: "claude", runId, itemId, event };
}

/** Mounts a thread mid-stream with `WIDGET_REPLY`, commits the reply, then
 *  settles the run — checking that the widget's iframe stays the exact same
 *  DOM node across both transitions. */
async function streamCommitAndCheck({
  items,
  runs,
  runId,
  answerId,
}: {
  items: HarnessItem[];
  runs: Record<number, HarnessRun>;
  runId: number;
  answerId: number;
}) {
  useHarnessStore.setState({
    items: { [THREAD]: items },
    runs: { [THREAD]: runs },
    live: { [THREAD]: { running: true, streaming: WIDGET_REPLY, thinking: "", toolOutput: {} } },
  });

  await act(async () => {
    root.render(<LiveTimeline threadId={THREAD} />);
  });
  // Let `useKitBase` resolve so `LiveWidget` mounts its streaming iframe.
  await act(async () => {
    await Promise.resolve();
  });

  const frameBefore = host.querySelector("iframe");
  expect(frameBefore).not.toBeNull();
  expect(frameBefore!.isConnected).toBe(true);
  expect(frameBefore!.getAttribute("title")).toBe("Phase circle");

  await act(async () => {
    useHarnessStore.getState().fold(env(runId, answerId, { type: "assistant_message", text: WIDGET_REPLY }));
  });

  const frameAfterCommit = host.querySelector("iframe");
  expect(frameAfterCommit).not.toBeNull();
  expect(frameAfterCommit === frameBefore).toBe(true);
  expect(frameBefore!.isConnected).toBe(true);

  await act(async () => {
    const store = useHarnessStore.getState();
    store.fold(
      env(runId, null, {
        type: "run_settled",
        answer_item_id: answerId,
        work_item_ids: [],
        delivery: "complete",
        status: "completed",
        started_at: at(0),
        ended_at: at(10),
      }),
    );
    store.fold(env(runId, null, { type: "turn_finished", status: "completed" }));
  });

  const frameAfterSettle = host.querySelector("iframe");
  expect(frameAfterSettle).not.toBeNull();
  expect(frameAfterSettle === frameBefore).toBe(true);
  expect(frameBefore!.isConnected).toBe(true);
}

describe("Timeline keeps a streamed widget frame mounted on commit", () => {
  test("first reply of a run", async () => {
    await streamCommitAndCheck({
      items: [item(1, "user", 1)],
      runs: {
        1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
      },
      runId: 1,
      answerId: 2,
    });
  });

  test("after a run switch divider", async () => {
    await streamCommitAndCheck({
      items: [item(1, "user", 1), item(2, "assistant", 1), item(3, "user", 2)],
      runs: {
        1: {
          id: 1,
          status: "completed",
          delivery: "delivered",
          answer_item_id: 2,
          started_ms: 0,
          ended_ms: 5_000,
          provider: "claude",
          model: "claude-opus-5-5",
        },
        2: {
          id: 2,
          status: "running",
          delivery: "unknown",
          answer_item_id: null,
          started_ms: 6_000,
          ended_ms: null,
          provider: "codex",
          model: "gpt-6.1-sol",
          handoff: { kind: "full", status: "inline", from: "claude", omitted: 0 },
        },
      },
      runId: 2,
      answerId: 4,
    });
    expect(host.querySelector("[data-divider-tone]")).not.toBeNull();
  });

  test("after a run's work fold", async () => {
    await streamCommitAndCheck({
      items: [item(1, "user", 1), item(2, "assistant", 1), item(3, "tool", 1)],
      runs: {
        1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
      },
      runId: 1,
      answerId: 4,
    });
  });

  test("after a continuation divider", async () => {
    await streamCommitAndCheck({
      items: [item(1, "continuation", 1, { content: "Sync finished — continuing", meta: JSON.stringify({ proposal: "1.0" }) })],
      runs: {
        1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
      },
      runId: 1,
      answerId: 2,
    });
  });

  test("after a steer row", async () => {
    await streamCommitAndCheck({
      items: [
        item(1, "user", 1),
        item(2, "tool", 1),
        item(3, "steer", 1, { content: "make it blue", meta: JSON.stringify({ message: 9, client: "c-1", delivery: "delivered" }) }),
      ],
      runs: {
        1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
      },
      runId: 1,
      answerId: 4,
    });
  });

  test("when an interrupted run keeps the reply as partial", async () => {
    useHarnessStore.setState({
      items: { [THREAD]: [item(1, "user", 1)] },
      runs: {
        [THREAD]: {
          1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
        },
      },
      live: { [THREAD]: { running: true, streaming: WIDGET_REPLY, thinking: "", toolOutput: {} } },
    });

    await act(async () => {
      root.render(<LiveTimeline threadId={THREAD} />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    const frameBefore = host.querySelector("iframe");
    expect(frameBefore).not.toBeNull();

    await act(async () => {
      const store = useHarnessStore.getState();
      store.fold(env(1, 2, { type: "assistant_message", text: WIDGET_REPLY }));
      store.fold(
        env(1, null, {
          type: "run_settled",
          answer_item_id: 2,
          work_item_ids: [],
          delivery: "partial",
          status: "interrupted",
          started_at: at(0),
          ended_at: at(10),
        }),
      );
      store.fold(env(1, null, { type: "turn_finished", status: "interrupted" }));
    });

    const frameAfter = host.querySelector("iframe");
    expect(frameAfter === frameBefore).toBe(true);
    expect(frameBefore!.isConnected).toBe(true);
    expect(host.textContent).toContain("Partial response");
  });
});
