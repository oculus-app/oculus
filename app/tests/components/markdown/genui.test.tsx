import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import Database from "@tauri-apps/plugin-sql";
import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Root } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { HarnessEnvelope, HarnessItem, HarnessRun } from "@/lib/harness";
import { buildRows, foldFindText, foldMatches, isCommentary } from "@/components/harness/timeline/rows";
import { mayHoldWidget, remarkFenceSplit, remarkWidgets } from "@/components/markdown/openui/remarkWidgets";
import { remarkUi } from "@/components/markdown/genui/remarkUi";
import { repairPrefix } from "@/components/markdown/genui/repair";

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
let GenUIFence: typeof import("@/components/markdown/genui/GenUIFence").GenUIFence;
let MD_COMPONENTS: typeof import("@/components/markdown/MdComponents").MD_COMPONENTS;
let CompactMd: typeof import("@/components/markdown/MdComponents").CompactMd;
let elementMarkdown: typeof import("@/lib/markdown/selection").elementMarkdown;
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
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
  ({ morph } = await import("@/components/markdown/genui/morph"));
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
  ({ MD_COMPONENTS, CompactMd } = await import("@/components/markdown/MdComponents"));
  ({ elementMarkdown } = await import("@/lib/markdown/selection"));
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

function sanitizeHtml(markup: string, prefix = "p1"): string {
  const host = document.createElement("div");
  host.append(sanitize(markup, prefix));
  return host.innerHTML;
}

function sanitizeDom(markup: string, prefix = "p1"): HTMLDivElement {
  const host = document.createElement("div");
  host.append(sanitize(markup, prefix));
  return host;
}

describe("genui sanitize", () => {
  const HOSTILE = {
    script: {
      in: `<div class="g">a<script>window.__pwned=1</script>b</div>`,
      out: `<div class="g">ab</div>`,
    },
    imgOnerror: {
      in: `<img src=x onerror="window.__pwned=1"><p>x</p>`,
      out: `<p>x</p>`,
    },
    onclick: {
      in: `<div class="g" onclick="window.__pwned=1" onmouseover="x()">hi</div>`,
      out: `<div class="g">hi</div>`,
    },
    jsLink: {
      in: `<a href="javascript:window.__pwned=1">link text</a>`,
      out: `link text`,
    },
    externalLink: {
      in: `<a href="https://evil.example">go</a>`,
      out: `go`,
    },
    styleElement: {
      in: `<style>body{display:none}</style><p>after</p>`,
      out: `<p>after</p>`,
    },
    styleAttr: {
      in: `<div style="position:fixed;inset:0;z-index:99;background:url(https://evil.example/t.png);--v:0.5;font-size:12px;fill:var(--color-brand)">s</div>`,
      out: `<div style="--v:0.5;font-size:12px;fill:var(--color-brand)">s</div>`,
    },
    appClasses: {
      in: `<div class="fixed inset-0 z-50 g g-row bg-red-500">c</div>`,
      out: `<div class="g g-row">c</div>`,
    },
    iframe: {
      in: `<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">`,
      out: ``,
    },
    form: {
      in: `<form action="https://evil.example"><input name=a value=b><button formaction="https://e">Send</button></form>`,
      out: ``,
    },
    svgForeign: {
      in: `<svg><foreignObject><div onclick="x()">f</div></foreignObject><circle r="3" onload="x()"/></svg>`,
      check: (host: HTMLElement) => {
        expect(host.querySelector("foreignObject, foreignobject, div")).toBeNull();
        const circle = host.querySelector("circle");
        expect(circle?.getAttribute("r")).toBe("3");
        expect(circle?.hasAttribute("onload")).toBe(false);
      },
    },
    svgUse: {
      in: `<svg><use href="https://evil.example/s.svg#a"/><use href="#a"/></svg>`,
      check: (host: HTMLElement) => {
        expect(host.querySelector("svg")?.children.length).toBe(0);
      },
    },
    svgAnimate: {
      in: `<svg><a><animate attributeName="href" to="javascript:alert(1)"/><text>t</text></a></svg>`,
      check: (host: HTMLElement) => {
        expect(host.querySelector("a, animate")).toBeNull();
        expect(host.querySelector("svg text")?.textContent).toBe("t");
      },
    },
    svgImage: {
      in: `<svg><image href="https://evil.example/t.png"/></svg>`,
      check: (host: HTMLElement) => {
        expect(host.querySelector("svg")?.children.length).toBe(0);
      },
    },
    svgUrlRefs: {
      in: `<svg><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#g)" stroke="url(https://evil.example/#x)" width="5" height="5"/></svg>`,
      check: (host: HTMLElement) => {
        const grad = host.querySelector("defs")?.firstElementChild;
        expect(grad?.localName.toLowerCase()).toBe("lineargradient");
        expect(grad?.getAttribute("id")).toBe("p1-g");
        const rect = host.querySelector("rect");
        expect(rect?.getAttribute("fill")).toBe("url(#p1-g)");
        expect(rect?.hasAttribute("stroke")).toBe(false);
        expect(rect?.getAttribute("width")).toBe("5");
        expect(rect?.getAttribute("height")).toBe("5");
      },
    },
    idPrefix: {
      in: `<div id="root" class="g">x</div>`,
      out: `<div id="p1-root" class="g">x</div>`,
    },
    runtimeAttrs: {
      in: `<div data-show="f=a" hidden data-off role="dialog" tabindex="5" aria-checked="true">r</div>`,
      out: `<div data-show="f=a">r</div>`,
    },
    dataUri: {
      in: `<svg><rect fill="url(data:image/svg+xml,<svg/>)" width="5" height="5"/></svg>`,
      check: (host: HTMLElement) => {
        const rect = host.querySelector("rect");
        expect(rect?.hasAttribute("fill")).toBe(false);
        expect(rect?.getAttribute("width")).toBe("5");
      },
    },
    template: {
      in: `<template><img src=x onerror=x()></template><noscript><p>n</p></noscript>`,
      out: ``,
    },
    comment: {
      in: `<!-- <script>x()</script> --><p>c</p>`,
      out: `<p>c</p>`,
    },
    mathml: {
      in: `<math><mi>x</mi></math>`,
      out: ``,
    },
    meta: {
      in: `<meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/">`,
      out: ``,
    },
  };

  for (const [name, entry] of Object.entries(HOSTILE)) {
    test(name, () => {
      if ("check" in entry) entry.check(sanitizeDom(entry.in));
      else expect(sanitizeHtml(entry.in)).toBe(entry.out);
      expect((window as unknown as { __pwned?: unknown }).__pwned).toBeUndefined();
    });
  }

  test("renders inline and display maths while keeping escaped and unclosed dollars literal", () => {
    const html = sanitizeHtml(`<p>Inline $x^2$, spaced $ y $, display $$\\sum_i x_i$$, money \\$5 and unclosed $5.</p>`);
    expect(html).toContain(`data-tex="Ix^2"`);
    expect(html).toContain(`data-tex="Iy"`);
    expect(html).toContain(`data-tex="D\\sum_i x_i"`);
    expect(html).toContain("katex");
    expect(html).toContain("money $5 and unclosed $5.");
  });

  test("does not run maths inside code or svg text", () => {
    const html = sanitizeHtml(`<p><code>$x^2$</code></p><svg><text>$y$</text></svg>`);
    expect(html).toContain("<code>$x^2$</code>");
    expect(html).toContain("<text>$y$</text>");
    expect(html).not.toContain("genui-math");
  });

  test("wraps bare tables in .g-table once for horizontal scroll", () => {
    const bare = sanitizeDom(`<table><tr><th>A</th></tr><tr><td>1</td></tr></table>`);
    expect(bare.firstElementChild?.className).toBe("g-table");
    expect(bare.querySelectorAll(".g-table").length).toBe(1);
    expect(bare.querySelector(".g-table > table th")?.textContent).toBe("A");
    expect(bare.querySelector(".g-table > table td")?.textContent).toBe("1");

    const wrapped = sanitizeDom(`<div class="g-table"><table><tr><td>1</td></tr></table></div>`);
    expect(wrapped.querySelectorAll(".g-table").length).toBe(1);
    expect(wrapped.querySelector(".g-table > table td")?.textContent).toBe("1");
  });

  test("passes reserved data-* attributes through inertly and forces button type", () => {
    const html = sanitizeHtml(
      `<div data-choice="f" data-value="a"><button data-option="a">A</button></div><div data-chart="bar" data-area=""></div>`,
    );
    expect(html).toContain(`data-choice="f"`);
    expect(html).toContain(`data-option="a"`);
    expect(html).toContain(`type="button"`);
    expect(html).toContain(`data-chart="bar"`);
    expect(html).toContain(`data-area=""`);
  });
});

describe("genui repairPrefix", () => {
  test("trims incomplete tags, comments, entities, maths and half-arrived closing fences", () => {
    const cases: [string, string][] = [
      [`<div class="g"><span>ab`, `<div class="g"><span>ab`],
      [`<div class="g"><rect x="1`, `<div class="g">`],
      [`<div class="g"><p>hi</p`, `<div class="g"><p>hi`],
      [`<p>see $\\sum_{i`, `<p>see `],
      [`<p>cost &am`, `<p>cost `],
      [`<p>char &#x20`, `<p>char `],
      [`<p>a &amp; b`, `<p>a &amp; b`],
      [`<p>a <!-- partial`, `<p>a `],
      [`<p>$x$ then $y`, `<p>$x$ then `],
      [`<p>then $$\\frac{1`, `<p>then `],
      [`<div class="g">hi</div>\n\`\``, `<div class="g">hi</div>`],
      [`<div class="g">hi</div>\n  \` `, `<div class="g">hi</div>`],
      [`<div class="g">hi</div>\n~~`, `<div class="g">hi</div>`],
    ];
    for (const [input, expected] of cases) {
      expect(repairPrefix(input)).toBe(expected);
    }
  });
});

describe("genui morph", () => {
  test("keeps element, SVG, text and formula identity across updates and preserves runtime attributes", () => {
    const live = document.createElement("div");
    morph(
      live,
      sanitize(`<div class="g"><p>One $x^2$</p><button data-option="a">A</button><svg class="cir"><rect width="10" height="10"/></svg></div>`, "p1"),
    );

    const outer = live.firstElementChild!;
    const p = outer.querySelector("p")!;
    const text = p.firstChild!;
    const math = p.querySelector("[data-tex]")!;
    const btn = outer.querySelector("button")!;
    const svg = outer.querySelector("svg")!;
    const rect = svg.querySelector("rect")!;

    // Simulate runtime-owned attributes written by stage 3.
    btn.setAttribute("data-on", "");
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "true");
    btn.setAttribute("tabindex", "0");

    morph(
      live,
      sanitize(
        `<div class="g"><p>Two $x^2$</p><button data-option="a">A</button><svg class="cir"><rect width="12" height="10"/><circle r="4"/></svg><span>tail</span></div>`,
        "p1",
      ),
    );

    expect(live.firstElementChild).toBe(outer);
    expect(outer.querySelector("p")).toBe(p);
    expect(p.firstChild).toBe(text);
    expect(text.nodeValue).toBe("Two ");
    expect(p.querySelector("[data-tex]")).toBe(math);
    expect(outer.querySelector("button")).toBe(btn);
    expect(btn.hasAttribute("data-on")).toBe(true);
    expect(btn.getAttribute("role")).toBe("radio");
    expect(btn.getAttribute("aria-checked")).toBe("true");
    expect(btn.getAttribute("tabindex")).toBe("0");
    expect(outer.querySelector("svg")).toBe(svg);
    expect(svg.querySelector("rect")).toBe(rect);
    expect(rect.getAttribute("width")).toBe("12");
    expect(svg.querySelector("circle")?.getAttribute("r")).toBe("4");
    expect(outer.lastElementChild?.textContent).toBe("tail");
  });

  test("preserves chart host children while syncing its attributes", () => {
    const live = document.createElement("div");
    morph(live, sanitize(`<div data-chart="bar" data-title="A"></div>`, "p1"));
    const host = live.firstElementChild!;
    const portalChild = document.createElement("span");
    portalChild.textContent = "chart";
    host.appendChild(portalChild);

    morph(live, sanitize(`<div data-chart="bar" data-title="B"></div>`, "p1"));
    expect(live.firstElementChild).toBe(host);
    expect(host.getAttribute("data-title")).toBe("B");
    expect(host.firstChild).toBe(portalChild);
  });
});

describe("ui fences in folded replies, find and copy", () => {
  test("mayHoldWidget and isCommentary recognize ui fences", () => {
    expect(mayHoldWidget("```ui\n<div class=\"g\">x</div>\n```")).toBe(true);
    expect(mayHoldWidget("~~~ui\n<div class=\"g\">x</div>\n~~~")).toBe(true);
    expect(mayHoldWidget("```uix\nnot ui\n```")).toBe(false);
    const commentary = {
      id: 1,
      thread_id: 1,
      kind: "assistant",
      ref_id: null,
      content: "Look:\n\n```ui\n<div class=\"g\">x</div>\n```",
      meta: null,
      created_at: "2026-11-21 10:00:00",
      run_id: null,
      display_role: "commentary",
    } as HarnessItem;
    expect(isCommentary(commentary)).toBe(false);
  });

  test("a folded reply with a ui fence gets an artifacts row and a prose pointer without shifting widget indices", async () => {
    const items: HarnessItem[] = [
      { id: 1, thread_id: 1, kind: "user", ref_id: null, content: "show stats", meta: null, created_at: "2026-11-21 10:00:00", run_id: 1 },
      {
        id: 2,
        thread_id: 1,
        kind: "assistant",
        ref_id: null,
        content: "Here:\n\n```ui\n<div class=\"g\">stat</div>\n```",
        meta: null,
        created_at: "2026-11-21 10:00:01",
        run_id: 1,
        display_role: "commentary",
      },
      { id: 3, thread_id: 1, kind: "tool", ref_id: "t1", content: "ls", meta: JSON.stringify({ kind: "bash", ok: true }), created_at: "2026-11-21 10:00:02", run_id: 1 },
      { id: 4, thread_id: 1, kind: "assistant", ref_id: null, content: "Done.", meta: null, created_at: "2026-11-21 10:00:03", run_id: 1, display_role: "answer" },
    ];
    const runs: Record<number, HarnessRun> = {
      1: { id: 1, status: "completed", delivery: "delivered", answer_item_id: 4, started_ms: 0, ended_ms: 3000 },
    };
    const rows = buildRows(items, false, { runs });
    expect(rows.map((r) => r.kind)).toEqual(["item", "work", "artifacts", "item"]);
    expect(rows[2]).toMatchObject({ kind: "artifacts", id: "a-2", item: { id: 2 } });

    const mixed = "Intro\n\n```widget\n// title: A\n```\n\n```ui\n<div class=\"g\">x</div>\n```\n\n```openui\nroot = Stack([])\n```\n\nOutro";
    const splitDraw = (split: "artifacts" | "prose") =>
      renderToStaticMarkup(
        createElement(ReactMarkdown, {
          remarkPlugins: [remarkWidgets, remarkUi, [remarkFenceSplit, split]],
          components: {
            code: (p: Record<string, unknown>) =>
              createElement("i", {
                "data-index": p["data-widget-index"],
                "data-closed": String(p["data-fence-closed"]),
                "data-lang": p.className,
              }),
            "widget-pointer": (p: Record<string, unknown>) => createElement("b", { "data-lang": p["data-lang"] }),
          } as never,
          children: mixed,
        }),
      );

    const artifacts = splitDraw("artifacts");
    expect(artifacts).not.toContain("Intro");
    expect(artifacts).toContain(`data-lang="language-ui"`);
    expect(artifacts).toContain(`data-closed="true"`);
    expect([...artifacts.matchAll(/data-index="(\d)"/g)].map((m) => m[1])).toEqual(["0", "1"]);

    const prose = splitDraw("prose");
    expect(prose).toContain("Intro");
    expect(prose).toContain("Outro");
    expect(prose).toContain(`<b data-lang="ui"></b>`);

    const mount = document.body.appendChild(document.createElement("div"));
    const root = createRoot(mount);
    await act(async () => {
      root.render(<CompactMd text={mixed} split="prose" />);
    });
    expect(mount.textContent).toContain("Visual shown below");
    expect(mount.textContent).toContain("Widget shown below");
    expect(mount.textContent).toContain("Card shown below");
    await act(async () => {
      root.unmount();
    });
    mount.remove();
  });

  test("foldFindText skips ui fences while keeping surrounding prose", () => {
    const items = [
      { id: 2, kind: "assistant", content: "Checking the numbers.\n\n```ui\n<div class=\"g-stat\"><b>14.5</b></div>\n```" },
    ] as HarnessItem[];
    const text = foldFindText(items);
    expect(foldMatches(text, "checking the numbers")).toBe(true);
    expect(foldMatches(text, "14.5")).toBe(false);
    expect(foldMatches(text, "g-stat")).toBe(false);
  });

  test("remarkUi marks open vs closed fences", () => {
    const renderCode = (md: string) =>
      renderToStaticMarkup(
        createElement(ReactMarkdown, {
          remarkPlugins: [remarkUi],
          components: {
            code: (p: Record<string, unknown>) => createElement("i", { "data-closed": String(p["data-fence-closed"]) }),
          } as never,
          children: md,
        }),
      );
    expect(renderCode("```ui\n<div class=\"g\">open")).toContain(`data-closed="false"`);
    expect(renderCode("```ui\n<div class=\"g\">done</div>\n```")).toContain(`data-closed="true"`);
    expect(renderCode("~~~ui\n<div class=\"g\">done</div>\n~~~")).toContain(`data-closed="true"`);
  });

  test("copy as markdown emits the ui fence via data-md", async () => {
    const md = "Before.\n\n```ui\n<div class=\"g\"><b>42</b></div>\n```\n\nAfter.";
    const mount = document.body.appendChild(document.createElement("div"));
    const root = createRoot(mount);
    await act(async () => {
      root.render(<ReactMarkdown remarkPlugins={[remarkUi]} components={MD_COMPONENTS}>{md}</ReactMarkdown>);
    });
    const genui = mount.querySelector(".genui");
    expect(genui?.getAttribute("data-md")).toBe("```ui\n<div class=\"g\"><b>42</b></div>\n```");
    // linkedom's Range lacks intersectsNode; verify selection.ts walks data-md when a range spans mount.
    const range = {
      startContainer: mount,
      startOffset: 0,
      endContainer: mount,
      endOffset: mount.childNodes.length,
      commonAncestorContainer: mount,
      intersectsNode: (node: Node) => mount.contains(node),
      cloneRange() { return this; },
    } as unknown as Range;
    const origCreateRange = document.createRange.bind(document);
    document.createRange = () => ({ ...range, selectNodeContents() {} }) as unknown as Range;
    try {
      expect(elementMarkdown(mount)).toBe("Before.\n\n```ui\n<div class=\"g\"><b>42</b></div>\n```\n\nAfter.");
    } finally {
      document.createRange = origCreateRange;
    }
    await act(async () => {
      root.unmount();
    });
    mount.remove();
  });
});

describe("GenUIFence in Timeline", () => {
  test("draws while streaming, keeps its DOM nodes across deltas and commit, and hides empty blocks", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(host);
    const THREAD = 99;
    useHarnessStore.getState().flushLive();
    useHarnessStore.getState().removed(THREAD);

    const UI_PARTIAL = "Summary:\n\n```ui\n<div class=\"g g-row\"><div class=\"g-stat\"><small>Hours</small><b>14.5</b></div>";
    const UI_FULL = `${UI_PARTIAL}<div class="g-stat"><small>Sessions</small><b>11</b></div></div>\n\`\`\``;
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
      items: { [THREAD]: [{ id: 1, thread_id: THREAD, kind: "user", ref_id: null, content: "stats", meta: null, created_at: at(0), run_id: 1 }] },
      runs: {
        [THREAD]: {
          1: { id: 1, status: "running", delivery: "unknown", answer_item_id: null, started_ms: 0, ended_ms: null, provider: "claude" },
        },
      },
      live: { [THREAD]: { running: true, streaming: UI_PARTIAL, thinking: "", toolOutput: {} } },
      holds: { [THREAD]: 1 },
    });

    await act(async () => {
      root.render(<Live />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });

    const genuiBefore = host.querySelector(".genui");
    const firstStatBefore = genuiBefore?.querySelector(".g-stat");
    expect(genuiBefore).not.toBeNull();
    expect(firstStatBefore?.textContent).toBe("Hours14.5");

    await act(async () => {
      useHarnessStore.getState().fold(env(2, { type: "assistant_message", text: UI_FULL }));
    });

    const genuiAfter = host.querySelector(".genui");
    const statsAfter = genuiAfter?.querySelectorAll(".g-stat");
    expect(genuiAfter).toBe(genuiBefore);
    expect(statsAfter?.[0]).toBe(firstStatBefore);
    expect(statsAfter?.length).toBe(2);
    expect(statsAfter?.[1]?.textContent).toBe("Sessions11");

    // A block that sanitises to nothing marks itself data-empty.
    await act(async () => {
      root.render(<GenUIFence source="<script>window.__pwned=1</script>   " closed />);
    });
    const emptyEl = host.querySelector(".genui");
    expect(emptyEl?.hasAttribute("data-empty")).toBe(true);
    expect(emptyEl?.querySelector("script")).toBeNull();
    expect(emptyEl?.textContent?.trim()).toBe("");

    await act(async () => {
      root.unmount();
    });
    host.remove();
    useHarnessStore.getState().removed(THREAD);
  });
});
