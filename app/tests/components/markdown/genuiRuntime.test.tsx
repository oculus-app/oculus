import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { HarnessEnvelope, HarnessItem, HarnessRun } from "@/lib/harness";
import { WidgetRow } from "@/components/markdown/openui/state";
import { createWidgetStore, entryState, genuiKey, useWidgetStore, widgetKey } from "@/stores/chat/widgetStore";

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

let sanitize: typeof import("@/components/markdown/genui/sanitize").sanitize;
let morph: typeof import("@/components/markdown/genui/morph").morph;
let BlockRuntime: typeof import("@/components/markdown/genui/runtime").BlockRuntime;
let GenUIFence: typeof import("@/components/markdown/genui/GenUIFence").GenUIFence;
let createRoot: typeof import("react-dom/client").createRoot;
let Timeline: typeof import("@/components/harness/timeline/Timeline").Timeline;
let TooltipProvider: typeof import("@/components/ui/tooltip").TooltipProvider;
let useHarnessStore: typeof import("@/stores/chat/harnessStore").useHarnessStore;
let itemsFor: typeof import("@/stores/chat/harnessStore").itemsFor;

const DJ_BLOCK = `<div class="g box">
  <div class="g-ctl"><div class="g-seg" data-choice="f" data-value="balanced"><button data-option="constant">Constant</button><button data-option="balanced">Balanced</button></div></div>
  <div data-scrub="s" data-options="0 1 2 3" data-edges="14.8 36.7 66" data-value="2" aria-label="Circuit stage">
    <svg class="cir" viewBox="0 0 640 200" aria-label="Circuit">
      <g class="ph" data-show="s=0"><line x1="80" y1="12" x2="80" y2="164"/></g>
      <g class="ph" data-show="s=1"><line x1="178" y1="12" x2="178" y2="164"/></g>
      <g class="ph" data-show="s=2"><line x1="398" y1="12" x2="398" y2="164"/></g>
      <g class="ph" data-show="s=3"><line x1="506" y1="12" x2="506" y2="164"/></g>
    </svg>
  </div>
  <div data-show="s=0">Start</div>
  <div data-show="s=1">First Hadamards</div>
  <div data-show="f=constant s=2">Constant oracle</div>
  <div data-show="f=balanced s=2">Balanced oracle</div>
  <div data-show="f=constant s=3">Constant final</div>
  <div data-show="f=balanced s=3">Balanced final</div>
</div>`;

function dispatchKey(target: EventTarget, key: string, extra: Record<string, unknown> = {}) {
  const ev = new Event("keydown", { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  ev.key = key;
  Object.assign(ev, extra);
  target.dispatchEvent(ev);
  return ev;
}

function dispatchPointer(target: EventTarget, type: string, props: Record<string, unknown> = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  Object.assign(ev, props);
  target.dispatchEvent(ev);
  return ev;
}

function visibleShows(root: Element): string[] {
  return Array.from(root.querySelectorAll("[data-show]:not([data-off])")).map((e) => e.getAttribute("data-show")!);
}

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
  mockIPC((cmd) => {
    if (cmd === "harness_capabilities") return [];
    if (cmd === "harness_provider_models") return [];
    if (cmd === "harness_sign_in_status") return { provider: "claude", signedIn: true, account: null };
    return null;
  });
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
  ({ morph } = await import("@/components/markdown/genui/morph"));
  ({ BlockRuntime } = await import("@/components/markdown/genui/runtime"));
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
  ({ createRoot } = await import("react-dom/client"));
  ({ Timeline } = await import("@/components/harness/timeline/Timeline"));
  ({ TooltipProvider } = await import("@/components/ui/tooltip"));
  ({ useHarnessStore, itemsFor } = await import("@/stores/chat/harnessStore"));
});

afterEach(() => {
  useWidgetStore.setState({ entries: {} });
});

afterAll(() => {
  clearMocks();
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("BlockRuntime behaviours", () => {
  test("choice click, keyboard (arrows, Home/End, Enter/Space) and roving tabindex", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    morph(root, sanitize(DJ_BLOCK, "p1"));
    const rt = new BlockRuntime(root);
    rt.apply();

    const group = root.querySelector("[data-choice]")!;
    const constant = root.querySelector('[data-option="constant"]') as HTMLElement;
    const balanced = root.querySelector('[data-option="balanced"]') as HTMLElement;
    const svg = root.querySelector("svg")!;

    expect(group.getAttribute("role")).toBe("radiogroup");
    expect(svg.getAttribute("role")).toBe("img");
    expect(balanced.hasAttribute("data-on")).toBe(true);
    expect(balanced.getAttribute("role")).toBe("radio");
    expect(balanced.getAttribute("aria-checked")).toBe("true");
    expect(balanced.getAttribute("tabindex")).toBe("0");
    expect(constant.hasAttribute("data-on")).toBe(false);
    expect(constant.getAttribute("aria-checked")).toBe("false");
    expect(constant.getAttribute("tabindex")).toBe("-1");
    expect(visibleShows(root)).toEqual(["s=2", "f=balanced s=2"]);

    // Click switches choice and roving tabindex.
    constant.dispatchEvent(new Event("click", { bubbles: true }));
    expect(rt.value("f")).toBe("constant");
    expect(constant.hasAttribute("data-on")).toBe(true);
    expect(constant.getAttribute("tabindex")).toBe("0");
    expect(balanced.getAttribute("tabindex")).toBe("-1");
    expect(visibleShows(root)).toEqual(["s=2", "f=constant s=2"]);

    // ArrowRight wraps to balanced; ArrowLeft moves back to constant.
    dispatchKey(constant, "ArrowRight");
    expect(rt.value("f")).toBe("balanced");
    dispatchKey(balanced, "ArrowLeft");
    expect(rt.value("f")).toBe("constant");

    // Enter and Space pick a targeted option.
    dispatchKey(balanced, "Enter");
    expect(rt.value("f")).toBe("balanced");
    dispatchKey(constant, " ");
    expect(rt.value("f")).toBe("constant");

    // End / Home select last / first option.
    dispatchKey(constant, "End");
    expect(rt.value("f")).toBe("balanced");
    dispatchKey(balanced, "Home");
    expect(rt.value("f")).toBe("constant");

    rt.destroy();
    root.remove();
  });

  test("scrub pointer drag with custom and equal edges, plus keyboard slider controls", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    morph(root, sanitize(DJ_BLOCK, "p1"));
    const rt = new BlockRuntime(root);
    rt.apply();

    const scrub = root.querySelector("[data-scrub]") as HTMLElement;
    expect(scrub.getAttribute("role")).toBe("slider");
    expect(scrub.getAttribute("tabindex")).toBe("0");
    expect(scrub.getAttribute("aria-valuemin")).toBe("0");
    expect(scrub.getAttribute("aria-valuemax")).toBe("3");
    expect(scrub.getAttribute("aria-valuenow")).toBe("2");
    expect(scrub.getAttribute("aria-valuetext")).toBe("2");

    // Mock box [100, 300] (width 200) to test edges [14.8, 36.7, 66].
    scrub.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, right: 300, bottom: 100, height: 100, x: 100, y: 0, toJSON() {} });
    const captured = new Set<number>();
    scrub.setPointerCapture = (id: number) => captured.add(id);
    scrub.hasPointerCapture = (id: number) => captured.has(id);
    scrub.releasePointerCapture = (id: number) => { captured.delete(id); };

    // Drag across all four custom regions.
    dispatchPointer(scrub, "pointerdown", { button: 0, pointerId: 7, clientX: 110 }); // 5% -> 0
    expect(rt.value("s")).toBe("0");
    expect(captured.has(7)).toBe(true);
    expect(visibleShows(root)).toEqual(["s=0", "s=0"]);

    dispatchPointer(scrub, "pointermove", { pointerId: 7, clientX: 150 }); // 25% -> 1
    expect(rt.value("s")).toBe("1");

    dispatchPointer(scrub, "pointermove", { pointerId: 7, clientX: 250 }); // 75% -> 3
    expect(rt.value("s")).toBe("3");
    expect(scrub.getAttribute("aria-valuenow")).toBe("3");
    expect(scrub.getAttribute("aria-valuetext")).toBe("3");
    expect(visibleShows(root)).toEqual(["s=3", "f=balanced s=3"]);

    dispatchPointer(scrub, "pointerup", { pointerId: 7 });
    expect(captured.has(7)).toBe(false);

    // Keyboard steps clamp at ends and support Home/End.
    dispatchKey(scrub, "ArrowRight");
    expect(rt.value("s")).toBe("3");
    dispatchKey(scrub, "ArrowLeft");
    expect(rt.value("s")).toBe("2");
    dispatchKey(scrub, "Home");
    expect(rt.value("s")).toBe("0");
    dispatchKey(scrub, "ArrowLeft");
    expect(rt.value("s")).toBe("0");
    dispatchKey(scrub, "End");
    expect(rt.value("s")).toBe("3");

    // Without data-edges, regions split equally (0..25, 25..50, 50..75, 75..100).
    scrub.removeAttribute("data-edges");
    dispatchPointer(scrub, "pointerdown", { button: 0, pointerId: 8, clientX: 160 }); // 30% -> 1
    expect(rt.value("s")).toBe("1");
    dispatchPointer(scrub, "pointermove", { pointerId: 8, clientX: 220 }); // 60% -> 2
    expect(rt.value("s")).toBe("2");
    dispatchPointer(scrub, "pointerup", { pointerId: 8 });

    rt.destroy();
    root.remove();
  });

  test("held drag survives a morph delta", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const partial = `<div class="g box"><div data-scrub="s" data-options="0 1 2 3" data-value="0"><svg class="cir"><rect width="10" height="10"/></svg></div><div data-show="s=0">Zero</div></div>`;
    const next = `<div class="g box"><div data-scrub="s" data-options="0 1 2 3" data-value="0"><svg class="cir"><rect width="10" height="10"/><circle r="5"/></svg></div><div data-show="s=0">Zero</div><div data-show="s=3">Three</div></div>`;

    morph(root, sanitize(partial, "p1"));
    const rt = new BlockRuntime(root);
    rt.apply();

    const scrub = root.querySelector("[data-scrub]") as HTMLElement;
    const svg = root.querySelector("svg")!;
    scrub.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, right: 100, bottom: 50, height: 50, x: 0, y: 0, toJSON() {} });
    const captured = new Set<number>();
    scrub.setPointerCapture = (id: number) => captured.add(id);
    scrub.hasPointerCapture = (id: number) => captured.has(id);
    scrub.releasePointerCapture = (id: number) => { captured.delete(id); };

    dispatchPointer(scrub, "pointerdown", { button: 0, pointerId: 3, clientX: 30 });
    expect(rt.value("s")).toBe("1");
    expect(captured.has(3)).toBe(true);

    // A delta morphs new SVG and show-pane nodes in while the pointer stays held.
    morph(root, sanitize(next, "p1"));
    rt.apply();
    expect(root.querySelector("[data-scrub]")).toBe(scrub);
    expect(root.querySelector("svg")).toBe(svg);
    expect(captured.has(3)).toBe(true);
    expect(rt.value("s")).toBe("1");

    // Moving the still-held pointer updates to the newly arrived pane.
    dispatchPointer(scrub, "pointermove", { pointerId: 3, clientX: 90 });
    expect(rt.value("s")).toBe("3");
    expect(visibleShows(root)).toEqual(["s=3"]);

    dispatchPointer(scrub, "pointerup", { pointerId: 3 });
    expect(captured.has(3)).toBe(false);

    rt.destroy();
    root.remove();
  });

  test("data-show naming an unknown choice or malformed expression shows nothing and logs nothing", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const errSpy = spyOn(console, "error");
    const warnSpy = spyOn(console, "warn");
    const logSpy = spyOn(console, "log");
    try {
      morph(
        root,
        sanitize(
          `<div data-choice="f" data-value="a"><button data-option="a">A</button></div>
           <div data-show="unknown=x">Hidden 1</div>
           <div data-show="f=a unknown=x">Hidden 2</div>
           <div data-show="malformed">Hidden 3</div>
           <div data-show="f=a|b">Visible</div>`,
          "p1",
        ),
      );
      const rt = new BlockRuntime(root);
      rt.apply();

      expect(visibleShows(root)).toEqual(["f=a|b"]);
      expect(errSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();

      rt.destroy();
    } finally {
      errSpy.mockRestore();
      warnSpy.mockRestore();
      logSpy.mockRestore();
      root.remove();
    }
  });

  test("never calls focus() from apply or when focus is outside the block", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    morph(root, sanitize(DJ_BLOCK, "p1"));
    const constant = root.querySelector('[data-option="constant"]') as HTMLElement;
    const balanced = root.querySelector('[data-option="balanced"]') as HTMLElement;
    const focusConstant = spyOn(constant, "focus");
    const focusBalanced = spyOn(balanced, "focus");

    const rt = new BlockRuntime(root);
    rt.apply();
    constant.dispatchEvent(new Event("click", { bubbles: true }));
    // Synthetic arrow key while activeElement is outside this block (hidden/parked pane).
    dispatchKey(constant, "ArrowRight");

    expect(focusConstant).not.toHaveBeenCalled();
    expect(focusBalanced).not.toHaveBeenCalled();

    rt.destroy();
    root.remove();
  });

  test("controls are inert while streaming and go live once the fence closes", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<GenUIFence source={DJ_BLOCK} closed={false} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const group = host.querySelector("[data-choice]")!;
    const constant = host.querySelector('[data-option="constant"]') as HTMLElement;
    const scrub = host.querySelector("[data-scrub]") as HTMLElement;
    expect(group.hasAttribute("inert")).toBe(true);
    expect(constant.hasAttribute("inert")).toBe(true);
    expect(scrub.hasAttribute("inert")).toBe(true);
    expect(visibleShows(host)).toEqual(["s=2", "f=balanced s=2"]);

    // Click, keyboard and drag do nothing while open.
    constant.dispatchEvent(new Event("click", { bubbles: true }));
    dispatchKey(scrub, "ArrowRight");
    dispatchPointer(scrub, "pointerdown", { button: 0, pointerId: 1, clientX: 5 });
    expect(visibleShows(host)).toEqual(["s=2", "f=balanced s=2"]);

    // Once closed, inert clears and controls work immediately.
    await act(async () => {
      root.render(<GenUIFence source={DJ_BLOCK} closed={true} />);
    });
    expect(group.hasAttribute("inert")).toBe(false);
    expect(constant.hasAttribute("inert")).toBe(false);
    expect(scrub.hasAttribute("inert")).toBe(false);

    constant.dispatchEvent(new Event("click", { bubbles: true }));
    dispatchKey(scrub, "ArrowRight");
    expect(visibleShows(host)).toEqual(["s=3", "f=constant s=3"]);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});

describe("GenUIFence persistence, stream survival and pruning", () => {
  test("a pick made after a fence closes survives later deltas, survives commit, and persists to widgetStore", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(host);
    const THREAD = 77;
    useHarnessStore.getState().flushLive();
    useHarnessStore.getState().removed(THREAD);

    const PART_1 = `Intro.\n\n\`\`\`ui\n${DJ_BLOCK}\n\`\`\`\n\nStill writing prose`;
    const PART_2 = `${PART_1} with another paragraph.\n\n\`\`\`ui\n<div class="g-stat"><b>1</b></div>\n\`\`\``;
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
      items: { [THREAD]: [{ id: 1, thread_id: THREAD, kind: "user", ref_id: null, content: "dj", meta: null, created_at: at(0), run_id: 1 }] },
      runs: {
        [THREAD]: {
          1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
        },
      },
      live: { [THREAD]: { running: true, streaming: PART_1, thinking: "", toolOutput: {} } },
      holds: { [THREAD]: 1 },
    });

    await act(async () => {
      root.render(<Live />);
    });

    // Fence 0 is already closed while the reply continues streaming.
    const genuiBefore = host.querySelector(".genui")!;
    const constant = genuiBefore.querySelector('[data-option="constant"]') as HTMLElement;
    const scrub = genuiBefore.querySelector("[data-scrub]") as HTMLElement;
    expect(constant.hasAttribute("inert")).toBe(false);
    constant.dispatchEvent(new Event("click", { bubbles: true }));
    dispatchKey(scrub, "ArrowRight");
    expect(visibleShows(genuiBefore)).toEqual(["s=3", "f=constant s=3"]);

    // More streamed deltas arrive in the reply after the pick.
    await act(async () => {
      useHarnessStore.setState((s) => ({
        live: { ...s.live, [THREAD]: { ...s.live[THREAD], streaming: PART_2 } },
      }));
    });
    expect(host.querySelector(".genui")).toBe(genuiBefore);
    expect(visibleShows(genuiBefore)).toEqual(["s=3", "f=constant s=3"]);

    // Reply commits to row 2.
    await act(async () => {
      useHarnessStore.getState().fold(env(2, { type: "assistant_message", text: PART_2 }));
    });
    expect(host.querySelector(".genui")).toBe(genuiBefore);
    expect(visibleShows(genuiBefore)).toEqual(["s=3", "f=constant s=3"]);

    // Picks made before commit flush into widgetStore on commit.
    const saved = useWidgetStore.getState().entries[genuiKey(THREAD, 2, 0)];
    expect(saved?.state).toEqual({ f: "constant", s: "3" });

    // Rewind from row 2 prunes the saved picks.
    await act(async () => {
      useHarnessStore.getState().fold(env(null, { type: "rewound", from_item_id: 2 }));
    });
    expect(useWidgetStore.getState().entries[genuiKey(THREAD, 2, 0)]).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
    host.remove();
    useHarnessStore.getState().removed(THREAD);
  });

  test("state restores across reload, changed source starts fresh, and delete/rewind prune saved picks", async () => {
    // Store round-trip with backing storage, isolated from widgetKey and pruned by delete/rewind.
    let raw = "{}";
    const disk = { getItem: () => raw, setItem: (_k: string, v: string) => { raw = v; } };
    const store1 = createWidgetStore(disk);
    store1.getState().save(genuiKey(1, 10, 0), DJ_BLOCK, { f: "constant", s: "1" });
    store1.getState().save(genuiKey(1, 11, 0), DJ_BLOCK, { f: "balanced", s: "3" });
    store1.getState().save(genuiKey(2, 10, 0), DJ_BLOCK, { f: "constant", s: "0" });
    store1.getState().save(widgetKey(1, 10, 0), "program", { step: 2 });

    // Reload into a fresh store instance.
    const store2 = createWidgetStore(disk);
    expect(entryState(store2.getState().entries[genuiKey(1, 10, 0)], DJ_BLOCK)).toEqual({ f: "constant", s: "1" });
    expect(entryState(store2.getState().entries[genuiKey(1, 10, 0)], DJ_BLOCK + " ")).toEqual({});
    expect(store2.getState().entries[widgetKey(1, 10, 0)]?.state).toEqual({ step: 2 });

    // Rewind thread 1 from row 11 removes row 11 only, keeping row 10 and thread 2.
    store2.getState().prune(1, 11);
    expect(store2.getState().entries[genuiKey(1, 10, 0)]).toBeDefined();
    expect(store2.getState().entries[genuiKey(1, 11, 0)]).toBeUndefined();
    expect(store2.getState().entries[genuiKey(2, 10, 0)]).toBeDefined();

    // Deleting thread 1 removes all remaining thread 1 entries and leaves thread 2 intact.
    store2.getState().prune(1);
    expect(store2.getState().entries[genuiKey(1, 10, 0)]).toBeUndefined();
    expect(store2.getState().entries[widgetKey(1, 10, 0)]).toBeUndefined();
    expect(store2.getState().entries[genuiKey(2, 10, 0)]).toBeDefined();

    // Component-level reload: pick, unmount, remount under the same WidgetRow restores state.
    const host = document.body.appendChild(document.createElement("div"));
    let root: Root = createRoot(host);
    await act(async () => {
      root.render(
        <WidgetRow.Provider value={{ thread: 5, row: 20 }}>
          <GenUIFence source={DJ_BLOCK} closed blockIndex={1} />
        </WidgetRow.Provider>,
      );
    });
    const constant = host.querySelector('[data-option="constant"]') as HTMLElement;
    const scrub = host.querySelector("[data-scrub]") as HTMLElement;
    constant.dispatchEvent(new Event("click", { bubbles: true }));
    dispatchKey(scrub, "Home");
    expect(useWidgetStore.getState().entries[genuiKey(5, 20, 1)]?.state).toEqual({ f: "constant", s: "0" });

    await act(async () => {
      root.unmount();
    });

    // Fresh mount restores the saved pick.
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WidgetRow.Provider value={{ thread: 5, row: 20 }}>
          <GenUIFence source={DJ_BLOCK} closed blockIndex={1} />
        </WidgetRow.Provider>,
      );
    });
    expect(visibleShows(host)).toEqual(["s=0", "s=0"]);
    expect(host.querySelector('[data-option="constant"]')?.hasAttribute("data-on")).toBe(true);

    // Changed source starts fresh with defaults.
    await act(async () => {
      root.render(
        <WidgetRow.Provider value={{ thread: 5, row: 20 }}>
          <GenUIFence source={DJ_BLOCK + "\n"} closed blockIndex={1} />
        </WidgetRow.Provider>,
      );
    });
    expect(visibleShows(host)).toEqual(["s=2", "f=balanced s=2"]);
    expect(host.querySelector('[data-option="balanced"]')?.hasAttribute("data-on")).toBe(true);

    // Deleting thread 5 through harnessStore prunes the saved picks.
    useHarnessStore.getState().removed(5);
    expect(useWidgetStore.getState().entries[genuiKey(5, 20, 1)]).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
