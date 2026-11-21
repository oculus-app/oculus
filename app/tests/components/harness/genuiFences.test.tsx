import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import Database from "@tauri-apps/plugin-sql";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import type { Code } from "mdast";
import type { HarnessEnvelope, HarnessItem } from "@/lib/harness";
import { foldFindText, foldMatches, hasStreamedFence, scanMarkdownFences, type FenceSpan } from "@/components/harness/timeline/rows";

const remarkPipeline = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** Extracts fenced code blocks (excluding 4-space indented code blocks) from
 *  the reply's real remark pipeline. */
function remarkFences(markdown: string): FenceSpan[] {
  const tree = remarkPipeline.parse(markdown);
  const out: FenceSpan[] = [];
  visit(tree, "code", (node: Code) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start == null || end == null) return;
    const first = markdown[start];
    if (first !== "`" && first !== "~") return;
    out.push({ lang: node.lang ?? "", start, end });
  });
  return out;
}

const CASES: [string, string][] = [
  ["plain backtick ui fence with trailing prose", "Intro.\n\n```ui\n<div class=\"g\">body</div>\n```\n\nTrailing prose."],
  ["plain tilde ui fence with trailing prose", "Intro.\n\n~~~ui\n<div class=\"g\">body</div>\n~~~\n\nTrailing prose."],
  ["1-3 space indented backtick fence", "   ```ui\n   <div class=\"g\">body</div>\n   ```\n\nAfter."],
  ["4-space indented code block is not a fence", "    ```ui\n    not a fence\n    ```\n\nAfter."],
  ["tab-indented code block is not a fence", "\t```ui\n\tnot a fence\n\t```\n\nAfter."],
  ["4-space indented line inside paragraph is lazy continuation", "Paragraph\n    ```ui\n    still paragraph\n    ```\n\nAfter."],
  ["fence interrupts paragraph at 0-3 spaces", "Paragraph\n  ```ui\n  body\n  ```\nAfter."],
  ["blockquoted ui fence with text outside quote", "> ```ui\n> <div class=\"g\">secret</div>\n> ```\n\nGlossary after."],
  ["blockquoted ui fence with text continuing in quote", "> ```ui\n> <div class=\"g\">secret</div>\n> ```\n> Still quoted."],
  ["unclosed blockquoted ui fence ends with blockquote", "> ```ui\n> <div class=\"g\">secret</div>\n\nOutside prose."],
  ["nested blockquote ui fence with text after inner quote", "> > ```ui\n> > secret\n> > ```\n> Outer text."],
  ["unclosed nested blockquote fence followed by outer fence", "> > ```ui\n> > secret\n> ```widget\n> // w\n> ```\nAfter."],
  ["unclosed fence indented under bullet list item ends before outside", "- entry\n\n  ```ui\n  x\n\noutside"],
  ["unclosed fence in list item spans internal blank line then ends", "- entry\n\n  ```ui\n  a\n\n  b\n\noutside"],
  ["closed fence directly after bullet list marker", "- ```ui\n  <div class=\"g\">body</div>\n  ```\n\noutside"],
  ["unclosed fence directly after bullet list marker", "- ```ui\n  body\noutside"],
  ["unclosed fence in list item ends at next sibling list item", "- ```ui\n  body\n- next item"],
  ["closed fence directly after ordered list marker", "1. ```widget\n   export default () => null\n   ```\n\noutside"],
  ["unclosed fence directly after two-digit ordered list marker", "10) ```ui\n    body\noutside"],
  ["fence directly after tab-separated list marker", "-\t```ui\n\tbody\n\t```\noutside"],
  ["bullet and 1. list items interrupt paragraph; 2. does not", "para\n- ```ui\n  a\n  ```\n\npara2\n2. ```ui\n   b\n   ```"],
  ["5 spaces after list marker is indented code not a fence", "-     ```ui\n      not a fence\n      ```\noutside"],
  ["list item inside blockquote with fence", "> - ```ui\n>   body\n>   ```\n> after"],
  ["blockquote inside list item with unclosed fence", "- > ```ui\n  > body\n  after"],
  ["empty list item then one newline vs two newlines", "-\n  ```ui\n  inside\noutside\n\n-\n\n  ```ui\n  top\n  ```\nafter"],
  ["longer closing fence closes backtick and tilde fences", "```ui\nbody\n`````\nmid\n~~~widget\nbody\n~~~~~\nafter"],
  ["fence inside a longer outer backtick fence", "````md\n```ui\n<div>example</div>\n```\n````\nafter"],
  ["backtick fence inside a tilde outer fence", "~~~~md\n```ui\n<div>example</div>\n```\n~~~~\nafter"],
  ["unclosed top-level fence to EOF", "Intro.\n\n```ui\n<div>still streaming"],
  ["CRLF line endings with closed and unclosed list fences", "- entry\r\n\r\n  ```ui\r\n  x\r\n\r\noutside\r\n\r\n```openui\r\nroot = Text(\"ok\")\r\n```\r\nafter"],
  ["uppercase and mixed-case UI/Ui/Widget/OpenUI tags keep exact casing", "```UI\nsecret-upper\n```\n\n```Ui\nsecret-mixed\n```\n\n```Widget\nsecret-w\n```\n\n```OpenUI\nsecret-o\n```"],
  ["info string with extra tokens and backtick-in-info rules", "```ui extra meta\nbody\n```\n\nInline ```ui``` text\n\n~~~ui`ok\ntilde-body\n~~~\nafter"],
  ["ordinary widget, openui, openui-lang and ui fences in one reply", "```widget\n// w\n```\n\n```openui\nroot = Stack([])\n```\n\n```openui-lang\nroot = Stack([])\n```\n\n```ui\n<div class=\"g\">u</div>\n```\nend"],
];

describe("scanMarkdownFences agrees with the reply remark pipeline", () => {
  test(`matches remark-parse + gfm + math across ${CASES.length} inputs`, () => {
    expect(CASES.length).toBeGreaterThanOrEqual(25);
    for (const [name, md] of CASES) {
      expect(scanMarkdownFences(md), name).toEqual(remarkFences(md));
    }
  });

  test("foldFindText preserves prose after unclosed list fences and keeps uppercase UI bodies searchable", () => {
    const listText = foldFindText([{ id: 1, kind: "assistant", content: "- entry\n\n  ```ui\n  secret-box\n\noutside" } as HarnessItem]);
    expect(foldMatches(listText, "outside")).toBe(true);
    expect(foldMatches(listText, "secret-box")).toBe(false);

    const upperText = foldFindText([{ id: 2, kind: "assistant", content: "Before\n\n```UI\nsearchable upper code\n```\n\nAfter" } as HarnessItem]);
    expect(foldMatches(upperText, "searchable upper code")).toBe(true);

    const mixedText = foldFindText([{ id: 3, kind: "assistant", content: "```Ui\nsearchable mixed code\n```" } as HarnessItem]);
    expect(foldMatches(mixedText, "searchable mixed code")).toBe(true);
  });

  test("hasStreamedFence promotes list-marker fences and ignores wrong-case tags", () => {
    expect(hasStreamedFence("- ```ui\n  <div class=\"g\">x</div>")).toBe(true);
    expect(hasStreamedFence("1. ```widget\n   export default () => null")).toBe(true);
    expect(hasStreamedFence("- entry\n\n  ```ui\n  <div>x</div>")).toBe(true);
    expect(hasStreamedFence("```UI\n<div>not ui</div>\n```")).toBe(false);
    expect(hasStreamedFence("```Ui\n<div>not ui</div>\n```")).toBe(false);
    expect(hasStreamedFence("```Widget\n// not widget\n```")).toBe(false);
    expect(hasStreamedFence("```openui\nroot = Stack([])\n```")).toBe(false);
  });
});

describe("Timeline promotes a list-marker ui fence across commit", () => {
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
    Node: dom.window.Node,
    Text: dom.window.Text,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    MutationObserver: noopObserver,
    IntersectionObserver: noopObserver,
    ResizeObserver: noopObserver,
    getComputedStyle: () => ({ getPropertyValue: () => "", overflowY: "visible", whiteSpace: "normal" }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.getOwnPropertyDescriptors(globalThis);

  let createRoot: typeof import("react-dom/client").createRoot;
  let Timeline: typeof import("@/components/harness/timeline/Timeline").Timeline;
  let TooltipProvider: typeof import("@/components/ui/tooltip").TooltipProvider;
  let useHarnessStore: typeof import("@/stores/chat/harnessStore").useHarnessStore;
  let itemsFor: typeof import("@/stores/chat/harnessStore").itemsFor;
  let dbLoad: { mockRestore(): void } | undefined;

  beforeAll(async () => {
    Object.assign(globalThis, globals);
    Object.assign(dom.window, {
      getComputedStyle: globals.getComputedStyle,
      matchMedia: globals.matchMedia,
      MutationObserver: noopObserver,
      IntersectionObserver: noopObserver,
      ResizeObserver: noopObserver,
      requestAnimationFrame: globals.requestAnimationFrame,
      cancelAnimationFrame: globals.cancelAnimationFrame,
    });
    // A failed load leaves `getDb` uncached, so later test files open their own database.
    dbLoad = spyOn(Database, "load").mockRejectedValue(new Error("no database in this test"));
    mockIPC((cmd) => {
      if (cmd === "harness_capabilities") return [];
      if (cmd === "harness_provider_models") return [];
      if (cmd === "harness_sign_in_status") return { provider: "claude", signedIn: true, account: null };
      return null;
    });
    ({ createRoot } = await import("react-dom/client"));
    ({ Timeline } = await import("@/components/harness/timeline/Timeline"));
    ({ TooltipProvider } = await import("@/components/ui/tooltip"));
    ({ useHarnessStore, itemsFor } = await import("@/stores/chat/harnessStore"));
  });

  afterAll(() => {
    dbLoad?.mockRestore();
    clearMocks();
    for (const key of Object.keys(globals)) {
      const descriptor = previous[key as keyof typeof globalThis];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  test("keeps the mounted .genui node across commit for a fence directly after a list marker", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(host);
    const THREAD = 191;
    useHarnessStore.getState().flushLive();
    useHarnessStore.getState().removed(THREAD);

    const PARTIAL = `- \`\`\`ui\n  <div class="g-stat"><small>Items</small><b>7</b></div>`;
    const FULL = `${PARTIAL}\n  \`\`\`\n\nOutside prose.`;
    const at = (s: number) => `2026-11-21 10:00:${String(s).padStart(2, "0")}`;
    const env = (itemId: number | null, event: HarnessEnvelope["event"]): HarnessEnvelope => ({
      threadId: THREAD,
      provider: "claude",
      runId: 1,
      itemId,
      event,
    });

    function Live() {
      const items = useHarnessStore((s) => itemsFor(THREAD, s.items));
      const running = useHarnessStore((s) => s.live[THREAD]?.running ?? false);
      return (
        <TooltipProvider>
          <Timeline items={items} threadId={THREAD} running={running} />
        </TooltipProvider>
      );
    }

    useHarnessStore.setState({
      items: { [THREAD]: [{ id: 1, thread_id: THREAD, kind: "user", ref_id: null, content: "list", meta: null, created_at: at(0), run_id: 1 }] },
      runs: {
        [THREAD]: {
          1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
        },
      },
      live: { [THREAD]: { running: true, streaming: PARTIAL, thinking: "", toolOutput: {} } },
      holds: { [THREAD]: 1 },
    });

    try {
      await act(async () => {
        root.render(<Live />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });

      const genuiBefore = host.querySelector(".genui");
      const statBefore = genuiBefore?.querySelector(".g-stat");
      expect(genuiBefore).not.toBeNull();
      expect(statBefore?.textContent).toBe("Items7");

      await act(async () => {
        useHarnessStore.getState().fold(env(2, { type: "assistant_message", text: FULL }));
      });

      expect(host.querySelector(".genui") === genuiBefore).toBe(true);
      expect(host.querySelector(".genui .g-stat") === statBefore).toBe(true);
      expect(host.textContent).toContain("Outside prose.");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      useHarnessStore.getState().removed(THREAD);
    }
  });
});
