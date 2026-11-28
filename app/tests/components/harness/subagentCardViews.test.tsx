import { afterAll, afterEach, beforeAll, beforeEach, expect, jest, spyOn, test } from "bun:test";
import type Database from "@tauri-apps/plugin-sql";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import * as db from "@/lib/db";
import type { HarnessModel, HarnessRun, HarnessThread } from "@/lib/harness";
import { chatHref } from "@/lib/harness/route";
import { STOP_PATIENCE_MS } from "@/lib/harness/runs";
import { PROVIDERS } from "@/lib/harness/registry";
import { forgetProviderModels } from "@/hooks/agents/useProviderModels";
import { proposalApi, type Proposal } from "@/lib/harness/proposals";

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
  Element: dom.window.Element,
  HTMLInputElement: dom.window.HTMLInputElement,
  NodeFilter: dom.window.NodeFilter ?? { SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_SKIP: 3 },
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
let useRouteThread: typeof import("@/components/harness/threads/useRouteThread").useRouteThread;
let RETRY_FIRST_MS: number;
let SubagentProgress: typeof import("@/components/markdown/openui/proposals/SubagentProgress").SubagentProgress;
let SubagentCard: typeof import("@/components/markdown/openui/proposals/SubagentCard").SubagentCard;
let WidgetRow: typeof import("@/components/markdown/openui/state").WidgetRow;
let useHarnessStore: typeof import("@/stores/chat/harnessStore").useHarnessStore;
let useProposalStore: typeof import("@/stores/chat/proposalStore").useProposalStore;
let harnessBefore: ReturnType<typeof import("@/stores/chat/harnessStore").useHarnessStore.getState>;
let proposalsBefore: ReturnType<typeof import("@/stores/chat/proposalStore").useProposalStore.getState>;

let root: Root;
let host: HTMLDivElement;
let read: { mockRestore(): void } | undefined;
const spies: { mockRestore(): void }[] = [];

const child: HarnessThread = {
  id: 777, parent_id: 1, provider: "claude", provider_session_id: null, model: "sonnet",
  subject_id: null, lecture_id: null, title: "Read the slides", status: "idle", usage: null,
  created_at: "2026-11-01 00:00:00", updated_at: "2026-11-01 00:00:00",
};

/** Each by-id read answers with the next of `answers`: rows, or an error to throw. */
function readsById(...answers: (HarnessThread[] | Error)[]) {
  read = spyOn(db, "getDb").mockResolvedValue({
    select: async () => {
      const next = answers.length > 1 ? answers.shift()! : answers[0];
      if (next instanceof Error) throw next;
      return next;
    },
  } as unknown as Database);
}

beforeAll(async () => {
  Object.assign(globalThis, globals);
  ({ createRoot } = await import("react-dom/client"));
  ({ useRouteThread, RETRY_FIRST_MS } = await import("@/components/harness/threads/useRouteThread"));
  ({ SubagentProgress } = await import("@/components/markdown/openui/proposals/SubagentProgress"));
  ({ SubagentCard } = await import("@/components/markdown/openui/proposals/SubagentCard"));
  ({ WidgetRow } = await import("@/components/markdown/openui/state"));
  ({ useHarnessStore } = await import("@/stores/chat/harnessStore"));
  ({ useProposalStore } = await import("@/stores/chat/proposalStore"));
  harnessBefore = useHarnessStore.getState();
  proposalsBefore = useProposalStore.getState();
});

beforeEach(() => {
  forgetProviderModels();
  useHarnessStore.setState({ threads: [], threadsLoaded: true });
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  read?.mockRestore();
  read = undefined;
  for (const spy of spies.splice(0)) spy.mockRestore();
  clearMocks();
  useHarnessStore.setState(harnessBefore, true);
  useProposalStore.setState(proposalsBefore, true);
});

afterAll(() => {
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const settle = () => act(async () => { await Bun.sleep(0); });

function Probe({ id }: { id: number }) {
  const { thread, missing } = useRouteThread(id);
  return <p>{thread ? "found" : missing ? "missing" : "looking"}</p>;
}

test("a failed lookup is not a deleted chat, and is tried again", async () => {
  readsById(new Error("database is locked"), []);
  const error = spyOn(console, "error").mockImplementation(() => {});
  try {
    await act(async () => root.render(<Probe id={child.id} />));
    await settle();
    expect(host.textContent).toBe("looking");
    await act(async () => { await Bun.sleep(RETRY_FIRST_MS + 50); });
    expect(host.textContent).toBe("missing");
  } finally {
    error.mockRestore();
  }
});

test("the started bar links to a child outside the list and withdraws the link once it reads as deleted", async () => {
  const card = <SubagentProgress id="4.0" phase="complete" child={child.id} report="Done." duration="1m" />;
  const bar = () => host.querySelector("[data-subagent-bar]");
  readsById([child]);
  await act(async () => root.render(card));
  await settle();
  expect(bar()?.getAttribute("data-tab-href")).toBe(chatHref(child.id, child.title));
  await act(async () => root.unmount());
  useHarnessStore.getState().removed(child.id);
  root = createRoot(host);
  read?.mockRestore();
  readsById([]);
  await act(async () => root.render(card));
  await settle();
  expect(bar()?.getAttribute("data-tab-href")).toBeNull();
  expect(host.textContent).toContain("Finished");
  expect(host.textContent).toContain("1m");
});

test("a lookup for another chat starts at the first wait, not the last one's backoff", async () => {
  const other: HarnessThread = { ...child, id: 778 };
  const error = spyOn(console, "error").mockImplementation(() => {});
  readsById(new Error("database is locked"), new Error("database is locked"), new Error("database is locked"), [other]);
  try {
    await act(async () => root.render(<Probe id={child.id} />));
    await act(async () => { await Bun.sleep(RETRY_FIRST_MS + 50); });
    // Two failures for the first id: its next wait would be twice the first.
    await act(async () => root.render(<Probe id={other.id} />));
    await act(async () => { await Bun.sleep(RETRY_FIRST_MS + 100); });
    expect(host.textContent).toBe("found");
  } finally {
    error.mockRestore();
  }
});

test("a settled card's child outside the loaded page is looked up without being listed", async () => {
  useHarnessStore.setState({ threads: [{ ...child, id: 1, parent_id: null }] });
  readsById([child]);
  await act(async () => root.render(<SubagentProgress id="4.0" phase="complete" child={child.id} report="Done." duration="1m" />));
  await settle();
  expect(host.querySelector("[data-subagent-bar]")?.getAttribute("data-tab-href")).toBe(chatHref(child.id, child.title));
  expect(useHarnessStore.getState().threads.map((t) => t.id)).toEqual([1]);
});

const pending: Proposal = {
  id: "4.0", item_id: 4, block: 0, thread_id: 1, kind: "Subagent", status: "pending", made: [], told: null,
  updated_at: "2026-11-01T00:00:00.000Z",
  state: { title: "Week 3", task: "Summarise week 3", provider: "claude", model: "sonnet", effort: null },
};

function Card({ row = 4 }: { row?: number }) {
  return <WidgetRow.Provider value={{ thread: 1, row }}>
    <SubagentCard input={{ title: "Week 3", task: "Summarise week 3" }} />
  </WidgetRow.Provider>;
}

test("a pending Discard names itself, and the model pill is off while a decision is in flight", async () => {
  // The brief's editor is CodeMirror, which this DOM cannot run.
  const editor = await import("@/components/markdown/openui/proposals/MarkdownInput");
  spies.push(spyOn(editor, "MarkdownInput").mockImplementation(() => <div>brief</div>));
  readsById([]);
  mockIPC((cmd) => (cmd === "harness_sign_in_status" ? { provider: "claude", signedIn: true, account: null } : []));
  spies.push(
    spyOn(proposalApi, "open").mockResolvedValue(pending),
    spyOn(proposalApi, "discard").mockReturnValue(new Promise(() => {})),
  );
  await act(async () => root.render(<Card />));
  await settle();
  const pill = () => host.querySelector('[aria-label="Model and reasoning"]');
  expect(pill()?.hasAttribute("disabled")).toBe(false);
  const discard = [...host.querySelectorAll("button")].find((b) => b.textContent === "Discard")!;
  await act(async () => { discard.dispatchEvent(new Event("click", { bubbles: true })); });
  await settle();
  expect(host.textContent).toContain("Discarding…");
  expect(host.textContent).not.toContain("Starting…");
  expect(pill()?.hasAttribute("disabled")).toBe(true);
});

test("every view of a card names the Discard one of them sent", async () => {
  const editor = await import("@/components/markdown/openui/proposals/MarkdownInput");
  spies.push(spyOn(editor, "MarkdownInput").mockImplementation(() => <div>brief</div>));
  readsById([]);
  mockIPC((cmd) => (cmd === "harness_sign_in_status" ? { provider: "claude", signedIn: true, account: null } : []));
  spies.push(
    spyOn(proposalApi, "open").mockResolvedValue({ ...pending, id: "6.0", item_id: 6 }),
    spyOn(proposalApi, "discard").mockReturnValue(new Promise(() => {})),
  );
  await act(async () => root.render(<><div data-view><Card row={6} /></div><div data-view><Card row={6} /></div></>));
  await settle();
  const [first, second] = [...host.querySelectorAll("[data-view]")];
  expect(first.textContent).not.toContain("Discarding…");
  const discard = [...first.querySelectorAll("button")].find((b) => b.textContent === "Discard")!;
  await act(async () => { discard.dispatchEvent(new Event("click", { bubbles: true })); });
  await settle();
  for (const view of [first, second]) {
    expect(view.textContent).toContain("Discarding…");
    expect(view.textContent).not.toContain("Starting…");
  }
});

test("an open model menu closes when its pill is turned off", async () => {
  const { ModelPicker } = await import("@/components/harness/composer/ModelPicker");
  const told: boolean[] = [];
  const picker = (disabled: boolean) => <ModelPicker providers={[]} provider="claude" model="sonnet" reasoning={null}
    onProvider={() => {}} onModel={() => {}} onReasoning={() => {}} open={!told.includes(false)}
    onOpenChange={(open) => told.push(open)} disabled={disabled} />;
  await act(async () => root.render(picker(false)));
  expect(told).toEqual([]);
  await act(async () => root.render(picker(true)));
  expect(told).toEqual([false]);
});

/** Claude's catalogue answers with `models` once `answer` is called. */
function claudeCatalogue() {
  let answer: (models: HarnessModel[]) => void = () => {};
  const claude = PROVIDERS.find((p) => p.id === "claude")!;
  spies.push(spyOn(claude, "fetchModels").mockReturnValue(new Promise((done) => { answer = done; })));
  return (models: HarnessModel[]) => act(async () => { answer(models); await Bun.sleep(0); });
}

const sonnet: HarnessModel = {
  id: "sonnet", label: "Sonnet", description: "", reasoningEfforts: ["low", "medium"], defaultReasoningEffort: "medium",
};

/** The card on `proposal`, the brief's editor stubbed (this DOM cannot run
 *  CodeMirror). Each test's card is its own: the store keeps a card's lane. */
let nextRow = 10;
async function renderCard(shape: Proposal) {
  const row = nextRow++;
  const proposal = { ...shape, id: `${row}.0`, item_id: row };
  const editor = await import("@/components/markdown/openui/proposals/MarkdownInput");
  spies.push(spyOn(editor, "MarkdownInput").mockImplementation(() => <div>brief</div>));
  readsById([]);
  mockIPC((cmd) => (cmd === "harness_sign_in_status" ? { provider: "claude", signedIn: true, account: null } : []));
  const edits: Proposal["state"][] = [];
  spies.push(
    spyOn(proposalApi, "open").mockResolvedValue(proposal),
    spyOn(proposalApi, "edit").mockImplementation(async (_id, state) => { edits.push(state); return { ...proposal, state }; }),
    spyOn(proposalApi, "start").mockReturnValue(new Promise(() => {})),
  );
  await act(async () => root.render(<Card row={row} />));
  await settle();
  return edits;
}

const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === label);
const pill = () => host.querySelector('[aria-label="Model and reasoning"]')?.textContent ?? "";
const click = async (label: string) => {
  await act(async () => { button(label)!.dispatchEvent(new Event("click", { bubbles: true })); });
  await settle();
};

test("Start waits for the agent's catalogue, then starts on the level the pill shows", async () => {
  const answer = claudeCatalogue();
  const edits = await renderCard({ ...pending, state: { ...pending.state, effort: "high" } });
  expect(button("Start")?.hasAttribute("disabled")).toBe(true);
  await answer([sonnet]);
  expect(pill()).toContain("Medium");
  expect(button("Start")?.hasAttribute("disabled")).toBe(false);
  await click("Start");
  expect(edits.at(-1)?.effort).toBe("medium");
  expect(proposalApi.start).toHaveBeenCalledTimes(1);
});

test("a model the catalogue does not list shows the level it starts on", async () => {
  const answer = claudeCatalogue();
  const edits = await renderCard({ ...pending, state: { ...pending.state, model: "sonnet-next", effort: "high" } });
  await answer([sonnet]);
  expect(pill()).toContain("High");
  await click("Start");
  expect(edits.at(-1)?.effort).toBe("high");
  expect(proposalApi.start).toHaveBeenCalledTimes(1);
});

test("Start again shows a level the model takes and runs on it", async () => {
  const answer = claudeCatalogue();
  const interrupted: Proposal = {
    ...pending, status: "created",
    state: { ...pending.state, effort: "high", job: { phase: "error", interrupted: true, error: "The app closed." } },
  };
  const edits = await renderCard(interrupted);
  expect(button("Start again")?.hasAttribute("disabled")).toBe(true);
  await answer([sonnet]);
  expect(host.textContent).toContain("Medium");
  expect(host.textContent).not.toContain("High");
  expect(button("Start again")?.hasAttribute("disabled")).toBe(false);
  await click("Start again");
  expect(edits.at(-1)?.effort).toBe("medium");
  expect(proposalApi.start).toHaveBeenCalledTimes(1);
});

test("a pending card folds its brief to one line until clicked, then opens the editor", async () => {
  const answer = claudeCatalogue();
  await renderCard(pending);
  await answer([sonnet]);
  const toggle = host.querySelector('button[data-brief-toggle]');
  expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  expect(toggle?.textContent).toContain("Summarise week 3");
  expect(host.textContent).not.toContain("brief");
  await act(async () => { toggle!.dispatchEvent(new Event("click", { bubbles: true })); });
  await settle();
  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).toContain("brief");
});

test("a Cancel the child has not answered points to its chat once overdue, until its run ends", async () => {
  jest.useFakeTimers();
  try {
    readsById([child]);
    const stopping: HarnessRun = {
      id: 31, status: "running", delivery: "delivered", answer_item_id: null, started_ms: Date.now() - 60_000,
      ended_ms: null, stopping: true, stop_requested_ms: Date.now(),
    };
    // The card holds the child to read its rows; here the store's runs are the test's.
    useHarnessStore.setState({ threads: [child], runs: { [child.id]: { [stopping.id]: stopping } }, hold: async () => {}, unhold: () => {}, release: () => {} });
    await act(async () => root.render(<SubagentProgress id="9.0" phase="running" child={child.id} report={null} duration="1m" />));
    // The innermost box that says so: the callout itself.
    const callout = () => [...host.querySelectorAll("div")].filter((d) => d.textContent?.startsWith("The subagent hasn’t stopped.")).pop();
    expect(callout()).toBeUndefined();
    await act(async () => { jest.advanceTimersByTime(STOP_PATIENCE_MS + 1); });
    expect(callout()).toBeDefined();
    expect(callout()!.querySelector("[data-tab-href]")?.getAttribute("data-tab-href")).toBe(chatHref(child.id, child.title));
    const ended = { ...stopping, status: "interrupted" as const, stopping: false, ended_ms: Date.now() };
    await act(async () => { useHarnessStore.setState({ runs: { [child.id]: { [stopping.id]: ended } } }); });
    expect(callout()).toBeUndefined();
  } finally {
    jest.useRealTimers();
  }
});
