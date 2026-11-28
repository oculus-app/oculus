import { afterAll, beforeAll, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderToStaticMarkup } from "react-dom/server";
import type { HarnessItem, HarnessThread } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { CHILDREN_OPEN_KEY } from "@/components/harness/threads/order";

const settings = new Map<string, string>();
const dom = parseHTML("<!doctype html><html><body></body></html>");
const globals = { window: dom.window, document: dom.document, localStorage: { getItem: (key: string) => settings.get(key) ?? null } };
const original = Object.getOwnPropertyDescriptors(globalThis);
const initial = useHarnessStore.getInitialState();
const originalThreads = initial.threads;
const parent: HarnessThread = {
  id: 11, parent_id: null, provider: "claude", provider_session_id: null, model: "sonnet",
  subject_id: null, lecture_id: null, title: "Plan revision", status: "idle", usage: null,
  created_at: "2026-11-01 00:00:00", updated_at: "2026-11-01 00:00:00",
};
const child: HarnessThread = { ...parent, id: 12, parent_id: 11, title: "Summarise lecture 3", provider: "codex" };
const noop = () => {};
let ThreadList: typeof import("@/components/harness/threads/ThreadList").ThreadList;
let User: typeof import("@/components/harness/timeline/Messages").User;
let AgentsGroup: typeof import("@/components/harness/threadInfo/AgentRows").AgentsGroup;
let TooltipProvider: typeof import("@/components/ui/tooltip").TooltipProvider;

beforeAll(async () => {
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  ({ ThreadList } = await import("@/components/harness/threads/ThreadList"));
  ({ User } = await import("@/components/harness/timeline/Messages"));
  ({ AgentsGroup } = await import("@/components/harness/threadInfo/AgentRows"));
  ({ TooltipProvider } = await import("@/components/ui/tooltip"));
});

afterAll(() => {
  initial.threads = originalThreads;
  for (const key of Object.keys(globals)) {
    if (original[key]) Object.defineProperty(globalThis, key, original[key]);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function column(threads: HarnessThread[], open: boolean) {
  settings.set(CHILDREN_OPEN_KEY, JSON.stringify(open ? [String(parent.id)] : []));
  const panel = { width: 284, restWidth: 284, dragging: false, collapsed: false, onMouseDown: noop, toggle: noop, setCollapsed: noop };
  return parseHTML(renderToStaticMarkup(<TooltipProvider><ThreadList
    threads={threads} panel={panel} subjects={[]} activeId={null} activeDraft={null} runningIds={new Set()}
    onOpen={noop} onNew={noop} onDelete={noop} onOpenDraft={noop} onDiscardDraft={noop}
  /></TooltipProvider>)).document;
}

test("the column nests the child once and lists it at the top after parent deletion", () => {
  const fold = '[aria-label="1 subagent of Plan revision"]';
  const childRow = '[data-thread-row="12"]';
  const closed = column([child, parent], false);
  expect(closed.querySelector(fold)?.getAttribute("aria-expanded")).toBe("false");
  expect(closed.querySelector(childRow)).toBeNull();
  const open = column([child, parent], true);
  expect(open.querySelectorAll(childRow)).toHaveLength(1);
  expect(open.querySelector(fold)?.nextElementSibling?.querySelector(childRow)).toBe(open.querySelector(childRow));
  const orphan = column([{ ...child, parent_id: null }], false);
  expect(orphan.querySelector(fold)).toBeNull();
  expect(orphan.querySelectorAll(childRow)).toHaveLength(1);
});

function message(text: string, meta: string | null) {
  initial.threads = [parent, child];
  const item: HarnessItem = { id: 40, thread_id: child.id, kind: "user", ref_id: null, created_at: "", content: text, meta };
  return parseHTML(renderToStaticMarkup(<TooltipProvider><User item={item} /></TooltipProvider>)).document;
}

test("the saved fromThread on the brief links to the parent while a typed row has no attribution", () => {
  const link = '[data-tab-href^="/chat?t=11&"]';
  expect(message("Review the slides", '{"fromThread":11}').querySelector(link)?.textContent).toBe(parent.title);
  expect(message("Review the slides", null).querySelector(link)).toBeNull();
});

test("a brief consisting entirely of a pasted block still names its parent", () => {
  const brief = message("<pasted_text>\nSummarise lecture 3.\n</pasted_text>", '{"fromThread":11}');
  expect(brief.querySelector('[data-tab-href^="/chat?t=11&"]')?.textContent).toBe(parent.title);
});

test("the Agents group pairs each child's mark and status with its own row", () => {
  const stopped = { ...child, last_run: "interrupted" as const };
  const approval = { ...parent, id: 13, parent_id: 11, title: "Explain week 4", pending_requests: 1 };
  initial.threads = [parent, stopped, approval];
  const group = parseHTML(renderToStaticMarkup(<AgentsGroup thread={parent} />)).document.querySelector('[aria-label="Agents"]');
  const rows = Array.from(group?.querySelectorAll("[data-info-row]") ?? []);
  expect(rows).toHaveLength(2);
  const codex = rows.find(row => row.textContent?.includes(stopped.title!));
  expect(codex?.textContent).toContain("Stopped");
  expect(codex?.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 320 320");
  const claude = rows.find(row => row.textContent?.includes(approval.title));
  expect(claude?.textContent).toContain("Waiting for approval");
  expect(claude?.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 100 100");
});

test("an older child read as running shows Working before another live event arrives", () => {
  initial.threads = [parent, { ...child, status: "running" }];
  const group = parseHTML(renderToStaticMarkup(<AgentsGroup thread={parent} />)).document.querySelector('[aria-label="Agents"]');
  expect(group?.querySelector("[data-info-row]")?.textContent).toContain("Working");
});
