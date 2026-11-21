import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

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

let ChartHost: typeof import("@/components/markdown/genui/ChartHost").ChartHost;
let createRoot: typeof import("react-dom/client").createRoot;
let Renderer: typeof import("@openuidev/react-lang").Renderer;
let library: typeof import("@/components/markdown/openui/library").library;
let maths: typeof import("@/lib/maths/useMathsReady");

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
  ({ ChartHost } = await import("@/components/markdown/genui/ChartHost"));
  ({ createRoot } = await import("react-dom/client"));
  ({ Renderer } = await import("@openuidev/react-lang"));
  ({ library } = await import("@/components/markdown/openui/library"));
  maths = await import("@/lib/maths/useMathsReady");
});

afterAll(() => {
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

/** Text outside rendered `.genui-math` and `.sr-only` subtrees. */
function visiblePlainText(root: Node): string {
  let out = "";
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (el.classList.contains("genui-math") || el.classList.contains("sr-only")) continue;
      out += visiblePlainText(el);
    }
  }
  return out;
}

describe("ui chart visible labels, ticks, units, hover readouts and screen-reader tables", () => {
  test("two-column bar chart typesets ticks, title, y-label, unit and hover readout, with plain-text sr-only table", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <ChartHost
            attrs={{
              "data-chart": "bar",
              "data-title": "Title $T$",
              "data-y-label": "Energy $E$",
              "data-labels": "$x$|$y$",
              "data-values": "1 2",
              "data-unit": "$u$",
            }}
          />,
        );
      });

      // Column layout: 2 rects inside SVG, plus x-axis ticks with KaTeX instead of raw $.
      const rects = Array.from(mount.querySelectorAll("svg rect"));
      expect(rects).toHaveLength(2);
      expect(visiblePlainText(mount)).not.toContain("$");
      expect(mount.querySelectorAll("a, img, button")).toHaveLength(0);
      // Title ($T$), y-label ($E$), and both x-ticks ($x$, $y$) all render KaTeX.
      expect(mount.querySelectorAll(".genui-math .katex").length).toBeGreaterThanOrEqual(4);

      // Hovering a bar typesets both the hovered label and the unit in the readout.
      await act(async () => {
        rects[0].dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      const readout = mount.querySelector("[aria-live='polite']")!;
      expect(readout.querySelectorAll(".genui-math .katex").length).toBe(2);
      expect(visiblePlainText(readout)).not.toContain("$");
      expect(readout.querySelectorAll("a, img, button")).toHaveLength(0);

      // Screen-reader table gets plain-text equivalents without raw $ delimiters.
      const table = mount.querySelector("table.sr-only")!;
      expect(table.textContent).not.toContain("$");
      expect(table.textContent).toContain("Energy E");
      expect(table.textContent).toContain("x");
      expect(table.textContent).toContain("1 u");
      expect(table.textContent).toContain("2 u");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("horizontal bar chart typesets row labels and row units, with plain-text sr-only table", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <ChartHost
            attrs={{
              "data-chart": "bar",
              "data-title": "Long labels",
              "data-labels": "State $\\alpha$|State $\\beta$",
              "data-values": "3 5",
              "data-unit": "$\\mu$",
            }}
          />,
        );
      });

      expect(mount.querySelectorAll("ul li")).toHaveLength(2);
      expect(visiblePlainText(mount)).not.toContain("$");
      // 2 row labels + 2 row value units = 4 formulas.
      expect(mount.querySelectorAll(".genui-math .katex").length).toBe(4);
      expect(mount.querySelectorAll("a, img, button")).toHaveLength(0);

      const table = mount.querySelector("table.sr-only")!;
      expect(table.textContent).not.toContain("$");
      expect(table.textContent).toContain("3 \\mu");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("donut chart typesets legend labels, units, default total centre and hover centre, with plain-text sr-only table", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <ChartHost
            attrs={{
              "data-chart": "donut",
              "data-title": "Mix $M$",
              "data-labels": "$a$|$b$",
              "data-values": "1 3",
              "data-unit": "$u$",
            }}
          />,
        );
      });

      expect(visiblePlainText(mount)).not.toContain("$");
      expect(mount.querySelectorAll("a, img, button")).toHaveLength(0);
      // Title ($M$), default center total (4 $u$), 2 legend labels ($a$, $b$) + 2 legend units (1 $u$, 3 $u$) = 6 formulas.
      expect(mount.querySelectorAll(".genui-math .katex").length).toBe(6);

      // Hovering a segment typesets its label in the centre.
      const segments = Array.from(mount.querySelectorAll("svg circle"));
      expect(segments).toHaveLength(2);
      await act(async () => {
        segments[0].dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      expect(visiblePlainText(mount)).not.toContain("$");

      const table = mount.querySelector("table.sr-only")!;
      expect(table.textContent).not.toContain("$");
      expect(table.textContent).toContain("1 u");
      expect(table.textContent).toContain("3 u");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("line and scatter charts typeset series names in legends and hover readouts, with plain-text sr-only tables", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      await act(async () => {
        root.render(
          <div>
            <ChartHost
              attrs={{
                "data-chart": "line",
                "data-title": "Curves",
                "data-series": "$f_1$: 0,1 1,2; $f_2$: 0,2 1,4",
              }}
            />
            <ChartHost
              attrs={{
                "data-chart": "scatter",
                "data-title": "Points",
                "data-series": "$S_1$: 1,2 2,3; $S_2$: 1,4 2,5",
              }}
            />
          </div>,
        );
      });

      const [lineFig, scatterFig] = Array.from(mount.querySelectorAll("figure"));
      expect(lineFig.querySelectorAll("svg polyline")).toHaveLength(2);
      expect(scatterFig.querySelectorAll("svg circle")).toHaveLength(4);

      // Trigger hover on line chart hit band.
      const lineHitBand = lineFig.querySelector("div.absolute.inset-y-0")!;
      await act(async () => {
        lineHitBand.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      const lineReadout = lineFig.querySelector("[aria-live='polite']")!;
      expect(lineReadout.querySelectorAll(".genui-math .katex").length).toBe(2);
      expect(visiblePlainText(lineReadout)).not.toContain("$");

      // Trigger hover on scatter chart dot.
      const scatterDot = scatterFig.querySelector("svg circle")!;
      await act(async () => {
        scatterDot.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      const scatterReadout = scatterFig.querySelector("[aria-live='polite']")!;
      expect(scatterReadout.querySelectorAll(".genui-math .katex").length).toBe(1);
      expect(visiblePlainText(scatterReadout)).not.toContain("$");

      for (const fig of [lineFig, scatterFig]) {
        expect(fig.querySelectorAll("a, img, button")).toHaveLength(0);
        expect(fig.querySelector("table.sr-only")?.textContent).not.toContain("$");
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("literal currency unit $ stays literal and stored openui charts preserve their plain-text paths", () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    try {
      const currencyHtml = renderToStaticMarkup(
        <ChartHost
          attrs={{
            "data-chart": "donut",
            "data-title": "Cost",
            "data-labels": "A|B",
            "data-values": "5 10",
            "data-unit": "$",
          }}
        />,
      );
      expect(currencyHtml).toContain("$5");
      expect(currencyHtml).toContain("$15");
      expect(currencyHtml).not.toContain("genui-math");

      // OpenUI keeps plain React text in ticks, units and sr-only tables.
      const openuiBar = renderToStaticMarkup(
        <Renderer
          response={`root = Stack([Bar("Title", ["$x$", "$y$"], [1, 2], "Y", "$u$")])`}
          library={library}
          isStreaming={false}
          publishObservability={false}
        >
          <Renderer.Content />
        </Renderer>,
      );
      expect(openuiBar).toContain(">$x$<");
      expect(openuiBar).toContain(">$y$<");
      expect(openuiBar).not.toContain("genui-math");

      const openuiDonut = renderToStaticMarkup(
        <Renderer
          response={`root = Stack([Donut("Mix", ["A", "B"], [1, 2], null, "$u$")])`}
          library={library}
          isStreaming={false}
          publishObservability={false}
        >
          <Renderer.Content />
        </Renderer>,
      );
      expect(openuiDonut).toContain("1 $u$");
      expect(openuiDonut).not.toContain("genui-math");
    } finally {
      ready.mockRestore();
    }
  });
});
