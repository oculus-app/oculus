import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import Database from "@tauri-apps/plugin-sql";
import { parseHTML } from "linkedom";
import { act, useRef } from "react";
import type { Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { HarnessEnvelope, HarnessItem, HarnessRun } from "@/lib/harness";
import { foldFindText, foldMatches, hasStreamedFence } from "@/components/harness/timeline/rows";

const dom = parseHTML("<!doctype html><html><body></body></html>");

type ObserverEntry = {
  cb: MutationCallback;
  target: Node;
  opts: MutationObserverInit;
};
const activeObservers = new Set<ObserverEntry>();

class TestMutationObserver {
  private entry: ObserverEntry | null = null;
  constructor(private cb: MutationCallback) {}
  observe(target: Node, opts: MutationObserverInit = {}) {
    this.disconnect();
    this.entry = { cb: this.cb, target, opts };
    activeObservers.add(this.entry);
  }
  disconnect() {
    if (this.entry) {
      activeObservers.delete(this.entry);
      this.entry = null;
    }
  }
  takeRecords() {
    return [];
  }
}

function notifyAttrMutation(target: Element, attr: string) {
  for (const entry of activeObservers) {
    if (!entry.opts.attributes) continue;
    if (entry.opts.attributeFilter && !entry.opts.attributeFilter.includes(attr)) continue;
    if (entry.target !== target && !(entry.opts.subtree && entry.target.contains(target))) continue;
    entry.cb([{ type: "attributes", target, attributeName: attr } as unknown as MutationRecord], {} as MutationObserver);
  }
}

class FakeRange {
  startContainer: Node = dom.document.body;
  startOffset = 0;
  endContainer: Node = dom.document.body;
  endOffset = 0;
  get commonAncestorContainer(): Node {
    return this.startContainer === this.endContainer ? this.startContainer : dom.document.body;
  }
  setStart(node: Node, offset: number) {
    this.startContainer = node;
    this.startOffset = offset;
  }
  setEnd(node: Node, offset: number) {
    this.endContainer = node;
    this.endOffset = offset;
  }
  compareBoundaryPoints(_how: number, other: FakeRange) {
    if (this.startContainer === other.startContainer) return this.startOffset - other.startOffset;
    return 0;
  }
  getBoundingClientRect() {
    return { top: 10, bottom: 20, left: 0, right: 100, width: 100, height: 10, x: 0, y: 10, toJSON() {} };
  }
  intersectsNode(node: Node) {
    return node === this.startContainer || node === this.endContainer;
  }
}
(FakeRange as unknown as { START_TO_START: number }).START_TO_START = 0;

class FakeHighlight extends Set<Range> {
  priority = 0;
}

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
  HTMLDetailsElement: class HTMLDetailsElement {},
  Range: FakeRange,
  Highlight: FakeHighlight,
  CSS: { highlights: new Map<string, FakeHighlight>() },
  MutationObserver: TestMutationObserver,
  IntersectionObserver: noopObserver,
  ResizeObserver: noopObserver,
  getComputedStyle: (el: Element) => ({
    display: el.hasAttribute("data-off") ? "none" : "block",
    overflowY: "visible",
    overflowX: "visible",
    getPropertyValue: () => "",
  }),
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
let GenUIFence: typeof import("@/components/markdown/genui/GenUIFence").GenUIFence;
let useDomFind: typeof import("@/hooks/find/useDomFind").useDomFind;

let origSetAttr: typeof Element.prototype.setAttribute;
let origRemoveAttr: typeof Element.prototype.removeAttribute;
let origToggleAttr: typeof Element.prototype.toggleAttribute;

let dbLoad: { mockRestore(): void } | undefined;

beforeAll(async () => {
  Object.assign(globalThis, globals);
  Object.assign(dom.window, {
    getComputedStyle: globals.getComputedStyle,
    matchMedia: globals.matchMedia,
    MutationObserver: TestMutationObserver,
    IntersectionObserver: noopObserver,
    ResizeObserver: noopObserver,
    requestAnimationFrame: globals.requestAnimationFrame,
    cancelAnimationFrame: globals.cancelAnimationFrame,
    getSelection: () => null,
  });

  // Wire checkVisibility and attribute mutation notifications onto linkedom Elements.
  const proto = dom.window.Element.prototype as Element & {
    checkVisibility?: (opts?: unknown) => boolean;
  };
  proto.checkVisibility = function (this: Element) {
    return !this.closest("[data-off]");
  };
  origSetAttr = proto.setAttribute;
  origRemoveAttr = proto.removeAttribute;
  origToggleAttr = proto.toggleAttribute;
  proto.setAttribute = function (this: Element, name: string, value: string) {
    origSetAttr.call(this, name, value);
    notifyAttrMutation(this, name);
  };
  proto.removeAttribute = function (this: Element, name: string) {
    origRemoveAttr.call(this, name);
    notifyAttrMutation(this, name);
  };
  proto.toggleAttribute = function (this: Element, name: string, force?: boolean) {
    const res = origToggleAttr.call(this, name, force);
    notifyAttrMutation(this, name);
    return res;
  };

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
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
  ({ useDomFind } = await import("@/hooks/find/useDomFind"));
});

afterAll(() => {
  dbLoad?.mockRestore();
  const proto = dom.window.Element.prototype;
  proto.setAttribute = origSetAttr;
  proto.removeAttribute = origRemoveAttr;
  proto.toggleAttribute = origToggleAttr;
  activeObservers.clear();
  clearMocks();
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("finding 10: Markdown fence detection for find and streaming promotion", () => {
  test("foldFindText keeps prose after a blockquoted ui, widget or openui fence", () => {
    const cases = [
      `> \`\`\`ui\n> <div class="g-stat"><b>secret-ui</b></div>\n> \`\`\`\n\nGlossary after.`,
      `> \`\`\`widget\n> // secret-widget\n> \`\`\`\n\nGlossary after.`,
      `> \`\`\`openui\n> root = Text("secret-openui")\n> \`\`\`\n\nGlossary after.`,
      `> \`\`\`openui-lang\n> root = Text("secret-lang")\n> \`\`\`\n\nGlossary after.`,
      `   > ~~~ui\n   > <div class="g">secret-tilde</div>\n   > ~~~~\n> Glossary after.`,
      `> > \`\`\`ui\n> > <div class="g">secret-nested</div>\n> > \`\`\`\n\nGlossary after.`,
    ];
    for (const content of cases) {
      const text = foldFindText([{ id: 1, kind: "assistant", content } as HarnessItem]);
      expect(foldMatches(text, "glossary after.")).toBe(true);
      expect(foldMatches(text, "secret")).toBe(false);
    }

    // Shared CommonMark fence helper handles blockquotes, indentation and nested fences for widget and ui.
    expect(hasStreamedFence("> ```ui\n> <div class=\"g\">x</div>")).toBe(true);
    expect(hasStreamedFence("> ```widget\n> // x")).toBe(true);
    expect(hasStreamedFence("   ~~~ui\n<div class=\"g\">x</div>")).toBe(true);
    expect(hasStreamedFence("    ```ui\n    indented code, not a fence")).toBe(false);
    expect(hasStreamedFence("````md\n```ui\n<div>example</div>\n```\n````")).toBe(false);
    expect(hasStreamedFence("Inline ```ui``` text")).toBe(false);
  });

  test("a blockquoted ui fence promotes to the keyed Reply row and keeps its DOM across commit", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(host);
    const THREAD = 88;
    useHarnessStore.getState().flushLive();
    useHarnessStore.getState().removed(THREAD);

    const PARTIAL = `> \`\`\`ui\n> <div class="g-stat"><small>Score</small><b>9</b></div>`;
    const FULL = `${PARTIAL}\n> \`\`\`\n\nGlossary after.`;
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
      items: { [THREAD]: [{ id: 1, thread_id: THREAD, kind: "user", ref_id: null, content: "quote", meta: null, created_at: at(0), run_id: 1 }] },
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
      expect(statBefore?.textContent).toBe("Score9");

      await act(async () => {
        useHarnessStore.getState().fold(env(2, { type: "assistant_message", text: FULL }));
      });

      expect(host.querySelector(".genui")).toBe(genuiBefore);
      expect(host.querySelector(".genui .g-stat")).toBe(statBefore);
      expect(host.textContent).toContain("Glossary after.");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
      useHarnessStore.getState().removed(THREAD);
    }
  });

  test("useDomFind recounts when changing a choice toggles data-off inside a ui block", async () => {
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    const source = `<div class="g">
      <div data-choice="tab" data-value="a"><button data-option="a">Tab A</button><button data-option="b">Tab B</button></div>
      <div data-show="tab=a">Alpha needle</div>
      <div data-show="tab=b">Beta needle</div>
    </div>`;

    let latestFind!: ReturnType<typeof useDomFind>;
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      const find = useDomFind(ref);
      latestFind = find;
      return (
        <div ref={ref}>
          <GenUIFence source={source} closed />
        </div>
      );
    }

    try {
      await act(async () => {
        root.render(<Harness />);
      });

      await act(async () => {
        latestFind.openFind();
        latestFind.bar.onQueryChange("Alpha needle");
      });
      expect(latestFind.bar.status).toBe("1 of 1");

      // Switch choice to Tab B so Alpha needle gets data-off and Beta needle becomes visible.
      const tabB = mount.querySelector('[data-option="b"]') as HTMLElement;
      await act(async () => {
        tabB.dispatchEvent(new Event("click", { bubbles: true }));
      });
      // Wait past useDomFind's RESEARCH_MS (150ms) debounce.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 220));
      });
      expect(latestFind.bar.status).toBe("No results");

      // Switch query to Beta needle (matches now), then switch back to Tab A.
      await act(async () => {
        latestFind.bar.onQueryChange("Beta needle");
      });
      expect(latestFind.bar.status).toBe("1 of 1");

      const tabA = mount.querySelector('[data-option="a"]') as HTMLElement;
      await act(async () => {
        tabA.dispatchEvent(new Event("click", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 220));
      });
      expect(latestFind.bar.status).toBe("No results");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
    }
  });
});
