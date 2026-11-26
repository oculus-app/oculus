import { afterAll, describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HarnessThread } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { ThreadRow } from "@/components/harness/threads/ThreadRow";
import { ChildRows } from "@/components/harness/threads/list/ChildRows";

// The crumb and the card open chats through the shell, whose playback adds a
// pagehide listener on import: a bare window and document stand in, as in
// `tests/lib/shell/tabRouters.test.ts`.
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", {
  configurable: true, value: { addEventListener() {}, documentElement: { style: {} } },
});
Object.defineProperty(globalThis, "window", {
  configurable: true, value: { addEventListener() {}, setTimeout, clearTimeout },
});
const { ParentCrumb } = await import("@/components/harness/threads/ParentCrumb");
const { QuestionBubble: Bubble } = await import("@/components/harness/timeline/QuestionBubble");
const { TooltipProvider } = await import("@/components/ui/tooltip");
/** The bubble's actions carry tooltips, which need their provider. */
const QuestionBubble = (props: Parameters<typeof Bubble>[0]) => (
  <TooltipProvider>
    <Bubble {...props} />
  </TooltipProvider>
);
const { BriefFrom } = await import("@/components/harness/timeline/BriefFrom");
const { AgentsGroup, ParentRow } = await import("@/components/harness/threadInfo/AgentRows");

// A server render reads a zustand store's initial state, so the list goes there.
const initial = useHarnessStore.getInitialState();
const before = { threads: initial.threads, live: initial.live, threadsLoaded: initial.threadsLoaded };
afterAll(() => {
  Object.assign(initial, before);
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

const sqlite = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace("T", " ");

const thread = (patch: Partial<HarnessThread> = {}): HarnessThread => ({
  id: 1,
  provider: "claude",
  provider_session_id: null,
  model: null,
  subject_id: null,
  lecture_id: null,
  title: "Plan the revision week",
  status: "idle",
  usage: null,
  created_at: sqlite(3_600_000),
  updated_at: sqlite(60_000),
  parent_id: null,
  ...patch,
});

const parent = thread({ id: 1 });
const working = thread({ id: 2, parent_id: 1, title: "Summarise week 7", provider: "codex", model: "gpt-x", created_at: sqlite(120_000) });
const asking = thread({ id: 3, parent_id: 1, title: "Draft quiz questions", pending_requests: 1, created_at: sqlite(60_000) });
const stopped = thread({ id: 4, parent_id: 1, title: "Read the slides", last_run: "interrupted", created_at: sqlite(180_000) });

const row = (patch: Partial<Parameters<typeof ThreadRow>[0]> = {}) =>
  renderToStaticMarkup(
    <ThreadRow
      thread={parent}
      subject={undefined}
      showSubject
      preview="Here is the plan"
      question={undefined}
      active={false}
      running={false}
      drafted={false}
      onOpen={() => {}}
      onNewTab={() => {}}
      onAskDelete={() => {}}
      {...patch}
    />,
  );

describe("a parent's row", () => {
  test("folded over a child waiting on approval, it says Approval", () => {
    const html = row({ childStatus: "approval" });
    expect(html).toContain("Approval");
    expect(html).toContain("text-warning");
    expect(html).not.toContain(">1m<");
  });

  test("a child's Working shows without a timer, since the run is the child's", () => {
    const html = row({ childStatus: "working", thread: { ...parent, run_started_at: sqlite(5_000) } });
    expect(html).toContain("Working");
    expect(html).not.toContain("tabular-nums\">5s");
  });

  test("with nothing bubbled it is an ordinary row", () => {
    expect(row()).toContain(">1m<");
  });
});

describe("ChildRows", () => {
  const fold = (open: boolean, kids = [working, asking]) =>
    renderToStaticMarkup(
      <ChildRows parentTitle="Plan" kids={kids} open={open} onToggle={() => {}} row={(t) => <p key={t.id}>{t.title}</p>} />,
    );

  test("folded, it says how many and draws none of them", () => {
    const html = fold(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/tabular-nums">2<\/span> subagents/);
    expect(html).not.toContain("Summarise week 7");
  });

  test("open, it draws each child under a guide line", () => {
    const html = fold(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Summarise week 7");
    expect(html).toContain("Draft quiz questions");
    expect(html).toContain("border-l");
    expect(html).toContain("will-change-[opacity,transform]");
  });

  test("one child is one subagent; none draws nothing", () => {
    expect(fold(false, [working])).toMatch(/tabular-nums">1<\/span> subagent</);
    expect(fold(false, [])).toBe("");
  });
});

describe("a child's page", () => {
  initial.threads = [parent, working, asking, stopped];
  initial.threadsLoaded = true;

  test("its crumb is the parent, with the parent's agent mark", () => {
    const html = renderToStaticMarkup(<ParentCrumb parentId={1} />);
    expect(html).toContain('data-tab-href="/chat?t=1');
    expect(html).toContain("Plan the revision week");
    expect(renderToStaticMarkup(<ParentCrumb parentId={null} />)).toBe("");
  });

  test("its brief reads as the parent's: full width on the left, under From", () => {
    const html = renderToStaticMarkup(
      <QuestionBubble text="Summarise week 7's slides" from={<BriefFrom parentId={1} />} />,
    );
    expect(html).toContain("items-start");
    expect(html).toContain("w-full");
    expect(html).not.toContain("max-w-[70%] min-w-0");
    expect(html).toMatch(/From<\/span><button[^>]*>Plan the revision week<\/button>/);
  });

  test("the student's own message stays on the right", () => {
    const html = renderToStaticMarkup(<QuestionBubble text="hello" />);
    expect(html).toContain("items-end");
    expect(html).toContain("max-w-[70%]");
  });

  test("a brief whose parent is not known yet names no chat and links nowhere", () => {
    const html = renderToStaticMarkup(<BriefFrom parentId={99} />);
    expect(html).toContain("another chat");
    expect(html).not.toContain("<button");
  });
});

describe("thread info", () => {
  test("the Agents group lists each child newest first with its mark, model and state", () => {
    initial.live = { 2: { ...(initial.live[2] ?? {}), running: true } } as typeof initial.live;
    const html = renderToStaticMarkup(<AgentsGroup thread={parent} />);
    expect(html).toContain('aria-label="Agents"');
    const order = ["Draft quiz questions", "Summarise week 7", "Read the slides"].map((t) => html.indexOf(t));
    expect(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]))).toBe(true);
    expect(html).toContain("Waiting for approval");
    expect(html).toMatch(/text-brand">Working/);
    expect(html).toContain("Stopped");
    expect(html).toContain("gpt-x");
    initial.live = before.live;
  });

  test("it holds five rows, then Show N more", () => {
    const many = Array.from({ length: 7 }, (_, i) => thread({ id: 10 + i, parent_id: 1, title: `Part ${i}` }));
    initial.threads = [parent, ...many];
    const html = renderToStaticMarkup(<AgentsGroup thread={parent} />);
    expect(html.match(/data-info-row/g)?.length).toBe(5);
    expect(html).toContain("Show 2 more");
    initial.threads = [parent, working, asking, stopped];
  });

  test("a chat with no children has no Agents group", () => {
    expect(renderToStaticMarkup(<AgentsGroup thread={working} />)).toBe("");
  });

  test("a child's card names its parent", () => {
    const html = renderToStaticMarkup(<ParentRow parentId={1} />);
    expect(html).toContain("From ");
    expect(html).toContain("Plan the revision week");
    expect(html).toContain("<button");
  });
});
