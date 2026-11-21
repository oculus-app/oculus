import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act, StrictMode } from "react";
import type { Root } from "react-dom/client";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import { hasMath, normalizeMath } from "@/lib/markdown/math";
import { splitMaths } from "@/components/markdown/genui/maths";
import { repairPrefix } from "@/components/markdown/genui/repair";
import { WidgetRow } from "@/components/markdown/openui/state";
import { genuiKey, useWidgetStore } from "@/stores/chat/widgetStore";

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
let createRoot: typeof import("react-dom/client").createRoot;
let maths: typeof import("@/lib/maths/useMathsReady");

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

const LEAST_SQUARES = `<div class="g g-derive">
  <div class="r"><span class="n">1</span><span class="l">$S$</span><span>$= \\sum (y_i - \\beta_0 - \\beta_1 x_i)^2$</span><span class="why">The sum of squared residuals</span></div>
  <div class="r"><span class="n">2</span><span class="l">$\\frac{\\partial S}{\\partial \\beta_0}$</span><span>$= -2 \\sum (y_i - \\beta_0 - \\beta_1 x_i) = 0$</span><span class="why">Differentiate in the intercept, set to zero</span></div>
  <div class="r"><span class="n">3</span><span class="l">$\\beta_0$</span><span>$= {}$<span class="hl">$\\bar y - \\beta_1 \\bar x$</span></span><span class="why">Divide by $n$, rearrange</span></div>
  <div class="r"><span class="n">4</span><span class="l">$\\frac{\\partial S}{\\partial \\beta_1}$</span><span>$= -2 \\sum x_i (y_i - \\beta_0 - \\beta_1 x_i) = 0$</span><span class="why">The same for the slope</span></div>
  <div class="r"><span class="n">5</span><span class="l">$0$</span><span>$= \\sum x_i \\bigl(y_i -{}$<span class="hl">$\\bar y + \\beta_1 \\bar x$</span>\${} - \\beta_1 x_i\\bigr)$</span><span class="why">Put line 3 in for $\\beta_0$</span></div>
  <div class="r"><span class="n">6</span><span class="l"></span><span><span class="fin">$\\beta_1 = \\dfrac{\\sum (x_i - \\bar x)(y_i - \\bar y)}{\\sum (x_i - \\bar x)^2}$</span></span><span class="why">Solve for the slope. Deviations sum to zero, so $x_i$ can become $x_i - \\bar x$</span></div>
</div>`;

const CHARTS_FIXTURE = [
  `<div class="g-chart" data-chart="bar" data-title="Hours by subject" data-labels="QC|LinMod|Algs" data-values="6.5 1.5 4" data-unit="h" data-y-label="Hours"></div>`,
  `<div class="g-chart" data-chart="line" data-title="Quiz accuracy" data-series="Revisited: 1,64 2,71 3,86; Not revisited: 1,66 2,67 3,68" data-x-label="Week" data-y-label="Accuracy (%)" data-area></div>`,
  `<div class="g-chart" data-chart="donut" data-title="Study mix" data-labels="Reading|Practice|Review" data-values="2 3 1" data-unit="h"></div>`,
  `<div class="g-chart" data-chart="scatter" data-title="Practice vs score" data-series="Sem 1: 1,52 2,61 4,78" data-x-label="Hours" data-y-label="Score" data-trend></div>`,
].join("\n");

function dispatchKey(target: EventTarget, key: string) {
  const ev = new Event("keydown", { bubbles: true, cancelable: true }) as Event & Record<string, unknown>;
  ev.key = key;
  target.dispatchEvent(ev);
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
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
  ({ morph } = await import("@/components/markdown/genui/morph"));
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
  ({ createRoot } = await import("react-dom/client"));
  maths = await import("@/lib/maths/useMathsReady");
});

afterEach(() => {
  useWidgetStore.setState({ entries: {} });
});

afterAll(() => {
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

describe("finding 3: chart host ownership transitions", () => {
  test("turning a chart host div into an ordinary div unmounts the portal cleanly and shows corrected text", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const errSpy = spyOn(console, "error");
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const bar = `<div class="g-chart" data-chart="bar" data-title="Hours" data-labels="A|B" data-values="2 4"></div>`;
      await act(async () => {
        root.render(<GenUIFence source={bar} closed />);
      });
      const chartHost = mount.querySelector("div[data-chart]");
      expect(chartHost).not.toBeNull();
      expect(chartHost?.querySelectorAll("svg rect").length).toBe(2);

      // Same fence updated to an ordinary div at the same DOM position.
      await act(async () => {
        root.render(<GenUIFence source={`<div class="g">Corrected text</div>`} closed />);
      });

      expect(mount.querySelector("[data-chart]")).toBeNull();
      const plain = mount.querySelector(".genui > div");
      expect(plain).not.toBeNull();
      expect(plain).not.toBe(chartHost);
      expect(plain?.textContent).toBe("Corrected text");
      expect(errSpy).not.toHaveBeenCalled();

      // Reverse: ordinary div replaced by a chart host without touching the old div.
      await act(async () => {
        root.render(<GenUIFence source={bar} closed />);
      });
      const nextHost = mount.querySelector("div[data-chart]");
      expect(nextHost).not.toBeNull();
      expect(nextHost).not.toBe(plain);
      expect(nextHost?.querySelectorAll("svg rect").length).toBe(2);
      expect(errSpy).not.toHaveBeenCalled();

      // Chart -> different chart kind keeps the same host element and updates its chart.
      const line = `<div class="g-chart" data-chart="line" data-title="Trend" data-series="A: 1,2 2,5"></div>`;
      await act(async () => {
        root.render(<GenUIFence source={line} closed />);
      });
      const afterKindSwitch = mount.querySelector("div[data-chart]");
      expect(afterKindSwitch).toBe(nextHost);
      expect(afterKindSwitch?.getAttribute("data-chart")).toBe("line");
      expect(afterKindSwitch?.querySelectorAll("svg polyline").length).toBe(1);
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      errSpy.mockRestore();
      ready.mockRestore();
    }
  });

  test("only HTML div elements are chart hosts in portal queries", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const source = `<span data-chart="bar" data-labels="A|B" data-values="1 2"></span><svg><g data-chart="bar" data-labels="A|B" data-values="1 2"></g></svg><div data-chart="bar" data-labels="A|B" data-values="1 2"></div>`;
      await act(async () => {
        root.render(<GenUIFence source={source} closed />);
      });
      expect(mount.querySelector("span[data-chart]")?.querySelector("svg")).toBeNull();
      expect(mount.querySelector("svg g[data-chart]")?.children.length).toBe(0);
      expect(mount.querySelector("div[data-chart]")?.querySelectorAll("svg rect").length).toBe(2);
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });
});

describe("finding 5: shared views merge picks and stay in sync", () => {
  test("two mounted copies of one committed fence keep both picks and mirror changes in both views", async () => {
    const mount1 = document.body.appendChild(document.createElement("div"));
    const mount2 = document.body.appendChild(document.createElement("div"));
    const root1: Root = createRoot(mount1);
    const root2: Root = createRoot(mount2);
    const key = genuiKey(12, 34, 0);
    try {
      await act(async () => {
        root1.render(
          <WidgetRow.Provider value={{ thread: 12, row: 34 }}>
            <GenUIFence source={DJ_BLOCK} closed blockIndex={0} />
          </WidgetRow.Provider>,
        );
        root2.render(
          <WidgetRow.Provider value={{ thread: 12, row: 34 }}>
            <GenUIFence source={DJ_BLOCK} closed blockIndex={0} />
          </WidgetRow.Provider>,
        );
      });

      // Change choice in the first view, then scrub in the second view.
      const constant1 = mount1.querySelector('[data-option="constant"]') as HTMLElement;
      const scrub2 = mount2.querySelector("[data-scrub]") as HTMLElement;
      constant1.dispatchEvent(new Event("click", { bubbles: true }));
      dispatchKey(scrub2, "ArrowRight");

      expect(useWidgetStore.getState().entries[key]?.state).toEqual({ f: "constant", s: "3" });
      expect(visibleShows(mount1)).toEqual(["s=3", "f=constant s=3"]);
      expect(visibleShows(mount2)).toEqual(["s=3", "f=constant s=3"]);
      expect(mount1.querySelector("[data-scrub]")?.getAttribute("aria-valuetext")).toBe("3");
      expect(mount2.querySelector('[data-option="constant"]')?.hasAttribute("data-on")).toBe(true);

      // Changed source starts fresh in the view and in the store on next pick.
      const changedSource = DJ_BLOCK + "\n";
      await act(async () => {
        root1.render(
          <WidgetRow.Provider value={{ thread: 12, row: 34 }}>
            <GenUIFence source={changedSource} closed blockIndex={0} />
          </WidgetRow.Provider>,
        );
      });
      expect(visibleShows(mount1)).toEqual(["s=2", "f=balanced s=2"]);

      // Rewind and thread delete still prune genui entries.
      useWidgetStore.getState().prune(12, 34);
      expect(useWidgetStore.getState().entries[key]).toBeUndefined();
      useWidgetStore.getState().patch(key, DJ_BLOCK, { f: "constant" });
      expect(useWidgetStore.getState().entries[key]?.state).toEqual({ f: "constant" });
      useWidgetStore.getState().prune(12);
      expect(useWidgetStore.getState().entries[key]).toBeUndefined();
    } finally {
      await act(async () => {
        root1.unmount();
        root2.unmount();
      });
      mount1.remove();
      mount2.remove();
    }
  });
});

describe("finding 7: StrictMode replay keeps streaming and hydration intact", () => {
  test("an open fence under StrictMode schedules frames and draws across streaming updates", async () => {
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <GenUIFence source={`<div class="g"><p>First</p>`} closed={false} />
          </StrictMode>,
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
      expect(mount.querySelector(".genui p")?.textContent).toBe("First");

      await act(async () => {
        root.render(
          <StrictMode>
            <GenUIFence source={`<div class="g"><p>First</p><p>Second</p></div>`} closed={false} />
          </StrictMode>,
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });
      expect(mount.querySelectorAll(".genui p").length).toBe(2);
      expect(mount.querySelectorAll(".genui p")[1].textContent).toBe("Second");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
    }
  });

  test("a committed fence under StrictMode rehydrates both saved controls and preserves the other on change", async () => {
    const key = genuiKey(9, 41, 0);
    useWidgetStore.getState().save(key, DJ_BLOCK, { f: "constant", s: "3" });

    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <WidgetRow.Provider value={{ thread: 9, row: 41 }}>
              <GenUIFence source={DJ_BLOCK} closed blockIndex={0} />
            </WidgetRow.Provider>
          </StrictMode>,
        );
      });

      expect(visibleShows(mount)).toEqual(["s=3", "f=constant s=3"]);

      // Changing choice keeps the saved scrub value intact.
      const balanced = mount.querySelector('[data-option="balanced"]') as HTMLElement;
      balanced.dispatchEvent(new Event("click", { bubbles: true }));

      expect(useWidgetStore.getState().entries[key]?.state).toEqual({ f: "balanced", s: "3" });
      expect(visibleShows(mount)).toEqual(["s=3", "f=balanced s=3"]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
    }
  });
});

describe("finding 8: reused elements clear obsolete runtime-owned attributes", () => {
  test("changing an open choice group into ordinary closed markup clears inert, role, aria-checked, data-on and tabindex", async () => {
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <GenUIFence
            source={`<div data-choice="f" data-value="a"><button data-option="a">A</button></div><div data-scrub="s" data-options="0 1" data-value="0">S</div><div data-show="f=b">Hidden</div><svg aria-label="Diagram"><rect width="4" height="4"/></svg>`}
            closed={false}
          />,
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 15));
      });

      const genui = mount.querySelector(".genui")!;
      const divBefore = genui.children[0];
      const btnBefore = divBefore.querySelector("button")!;
      const scrubBefore = genui.children[1];
      const showBefore = genui.children[2];
      const svgBefore = genui.children[3];

      expect(divBefore.hasAttribute("inert")).toBe(true);
      expect(divBefore.getAttribute("role")).toBe("radiogroup");
      expect(btnBefore.hasAttribute("inert")).toBe(true);
      expect(btnBefore.getAttribute("role")).toBe("radio");
      expect(btnBefore.getAttribute("aria-checked")).toBe("true");
      expect(btnBefore.hasAttribute("data-on")).toBe(true);
      expect(btnBefore.getAttribute("tabindex")).toBe("-1");
      expect(scrubBefore.getAttribute("role")).toBe("slider");
      expect(showBefore.hasAttribute("data-off")).toBe(true);
      expect(svgBefore.getAttribute("role")).toBe("img");

      // Replace with ordinary closed markup at the same DOM positions.
      await act(async () => {
        root.render(
          <GenUIFence
            source={`<div><button>Plain</button></div><div>Plain scrub</div><div>Now visible</div><svg><rect width="4" height="4"/></svg>`}
            closed
          />,
        );
      });

      expect(genui.children[0]).toBe(divBefore);
      expect(divBefore.querySelector("button")).toBe(btnBefore);
      expect(genui.children[1]).toBe(scrubBefore);
      expect(genui.children[2]).toBe(showBefore);
      expect(genui.children[3]).toBe(svgBefore);

      for (const attr of ["inert", "role"]) expect(divBefore.hasAttribute(attr)).toBe(false);
      for (const attr of ["inert", "role", "aria-checked", "data-on", "tabindex"]) {
        expect(btnBefore.hasAttribute(attr)).toBe(false);
      }
      for (const attr of ["inert", "role", "tabindex", "aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"]) {
        expect(scrubBefore.hasAttribute(attr)).toBe(false);
      }
      expect(showBefore.hasAttribute("data-off")).toBe(false);
      expect(svgBefore.hasAttribute("role")).toBe(false);
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
    }
  });
});

describe("finding 9: repairPrefix state machine and remark-math parity", () => {
  test("handles inequalities in maths, quoted attributes, and literal dollars in code, kbd and SVG", () => {
    expect(repairPrefix("<p>$x > 0")).toBe("<p>");
    expect(repairPrefix("<p>$x < y$")).toBe("<p>$x < y$");
    expect(repairPrefix("<p>$x < y")).toBe("<p>");
    expect(repairPrefix("<code>$5")).toBe("<code>$5");
    expect(repairPrefix("<kbd>$5")).toBe("<kbd>$5");
    expect(repairPrefix("<svg><text>$5")).toBe("<svg><text>$5");
    expect(repairPrefix("<code>$5</code>$x > 0")).toBe("<code>$5</code>");
    expect(repairPrefix('<div title="a > b">ok</div>')).toBe('<div title="a > b">ok</div>');
    expect(repairPrefix('<div title="a > b')).toBe("");
    expect(repairPrefix("<p>price \\$5")).toBe("<p>price \\$5");
  });

  test("splitMaths matches remark-math on delimiter forms including spaced dollars and trailing digits", () => {
    const proc = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkRehype);
    const remarkFormulas = (input: string): string[] => {
      const norm = hasMath(input) ? normalizeMath(input) : input;
      const hast = proc.runSync(proc.parse(norm));
      const out: string[] = [];
      const walk = (n: { type?: string; properties?: { className?: unknown }; children?: unknown[]; value?: string }) => {
        const cls = Array.isArray(n.properties?.className) ? n.properties.className : [];
        if (n.type === "element" && (cls.includes("math-inline") || cls.includes("math-display"))) {
          out.push((n.children ?? []).map((c) => (c as { value?: string }).value ?? "").join(""));
          return;
        }
        for (const ch of n.children ?? []) walk(ch as typeof n);
      };
      walk(hast as unknown as Parameters<typeof walk>[0]);
      return out;
    };

    const inputs = [
      "$x$",
      "$ x $",
      "$x$2",
      "$ not maths$",
      "$x $",
      "$ x$",
      "price \\$5 and $x$2 and $ y $",
      "\\$$x$",
      "$x > 0$",
      "$x < y$",
      "$$a$b$$",
      "$a$$b$",
      "$$x $y$",
      "$x $$y$$",
      "cost $",
      "Inline $x^2$ and $$\\sum_i x_i$$",
    ];
    for (const input of inputs) {
      const ours = splitMaths(input).pieces.filter((p): p is { tex: string; display: boolean } => "tex" in p).map((p) => p.tex);
      expect(ours).toEqual(remarkFormulas(input));
    }
  });

  test("property check: no prefix of any fixture leaks a raw math $, half tag or half entity", () => {
    const MIXED = `<div class="g" title="a > b"><p>Check $x < y$ and $x > 0$ &amp; &#x20; done.</p><code>$5</code><kbd>$9</kbd><svg viewBox="0 0 10 10"><text>$3</text></svg></div>`;
    const fixtures = [DJ_BLOCK, LEAST_SQUARES, CHARTS_FIXTURE, MIXED];

    const mathEligibleText = (root: Node): string => {
      let out = "";
      for (const node of Array.from(root.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          out += node.nodeValue ?? "";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          const tag = el.localName.toLowerCase();
          if (el.hasAttribute("data-tex") || tag === "code" || tag === "kbd" || tag === "svg") continue;
          out += mathEligibleText(el);
        }
      }
      return out;
    };

    for (const fixture of fixtures) {
      for (let len = 1; len <= fixture.length; len++) {
        const repaired = repairPrefix(fixture.slice(0, len));
        const host = document.createElement("div");
        host.append(sanitize(repaired, "p1"));
        const text = mathEligibleText(host);
        expect(text).not.toContain("$");
        expect(repaired).not.toMatch(/&#?[a-z0-9]*$/i);
        // Never ends inside an unclosed tag or comment outside completed math.
        expect(text).not.toContain("<");
      }
    }
  });
});

describe("nit: data-md backtick fence escapes backtick runs in the body", () => {
  test("wraps a body containing triple backticks in a four-backtick fence", async () => {
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const source = `<div class="g"><code>\`\`\`\ncode\n\`\`\`</code></div>`;
      await act(async () => {
        root.render(<GenUIFence source={source} closed />);
      });
      const md = mount.querySelector(".genui")?.getAttribute("data-md");
      expect(md).toBe(`\`\`\`\`ui\n${source}\n\`\`\`\``);

      // Re-parsing data-md yields a single ui code node with the exact source.
      const tree = unified().use(remarkParse).parse(md!);
      expect(tree.children).toHaveLength(1);
      const code = tree.children[0] as { type: string; lang?: string; value?: string };
      expect(code.type).toBe("code");
      expect(code.lang).toBe("ui");
      expect(code.value).toBe(source);
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
    }
  });
});
