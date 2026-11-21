import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { parseChartAttrs } from "@/components/markdown/genui/chartData";

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
let GenUIFence: typeof import("@/components/markdown/genui/GenUIFence").GenUIFence;
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
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
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

describe("parseChartAttrs", () => {
  test("parses bar chart attributes", () => {
    expect(
      parseChartAttrs({
        "data-chart": "bar",
        "data-title": "Hours by subject",
        "data-labels": "QC | LinMod | Algs | Stats",
        "data-values": "6.5 1.5 4 2.5",
        "data-unit": "h",
        "data-y-label": "Hours",
      }),
    ).toEqual({
      kind: "bar",
      title: "Hours by subject",
      labels: ["QC", "LinMod", "Algs", "Stats"],
      values: [6.5, 1.5, 4, 2.5],
      yLabel: "Hours",
      unit: "h",
    });

    expect(
      parseChartAttrs({
        "data-chart": "bar",
        "data-labels": "A|B",
        "data-values": "-2.5, 3.5",
      }),
    ).toEqual({
      kind: "bar",
      title: undefined,
      labels: ["A", "B"],
      values: [-2.5, 3.5],
      yLabel: undefined,
      unit: undefined,
    });
  });

  test("parses line chart attributes including multi-series and area flag", () => {
    expect(
      parseChartAttrs({
        "data-chart": "line",
        "data-title": "Quiz accuracy by week",
        "data-series": "Revisited: 1,64 2,71 3,79; Not revisited: 1,66 2,67 3,65",
        "data-x-label": "Week",
        "data-y-label": "Accuracy (%)",
        "data-area": "",
      }),
    ).toEqual({
      kind: "line",
      title: "Quiz accuracy by week",
      series: [
        { label: "Revisited", points: [{ x: 1, y: 64 }, { x: 2, y: 71 }, { x: 3, y: 79 }] },
        { label: "Not revisited", points: [{ x: 1, y: 66 }, { x: 2, y: 67 }, { x: 3, y: 65 }] },
      ],
      xLabel: "Week",
      yLabel: "Accuracy (%)",
      area: true,
    });

    expect(
      parseChartAttrs({
        "data-chart": "line",
        "data-series": "Loss: 1.0 0.7 0.4",
        "data-area": "false",
      }),
    ).toEqual({
      kind: "line",
      title: undefined,
      series: [{ label: "Loss", points: [{ x: 0, y: 1 }, { x: 1, y: 0.7 }, { x: 2, y: 0.4 }] }],
      xLabel: undefined,
      yLabel: undefined,
      area: false,
    });
  });

  test("parses donut chart attributes including center and unit", () => {
    expect(
      parseChartAttrs({
        "data-chart": "donut",
        "data-title": "Study mix",
        "data-labels": "Reading|Practice|Review",
        "data-values": "2 3 1",
        "data-center": "6h",
        "data-unit": "h",
      }),
    ).toEqual({
      kind: "donut",
      title: "Study mix",
      labels: ["Reading", "Practice", "Review"],
      values: [2, 3, 1],
      center: "6h",
      unit: "h",
    });
  });

  test("parses scatter chart attributes including trend flag and unnamed series", () => {
    expect(
      parseChartAttrs({
        "data-chart": "scatter",
        "data-title": "Practice vs score",
        "data-series": "1,52 2,61 4,78 5,86",
        "data-x-label": "Hours",
        "data-y-label": "Score (%)",
        "data-trend": "",
      }),
    ).toEqual({
      kind: "scatter",
      title: "Practice vs score",
      series: [
        {
          label: "Series 1",
          points: [{ x: 1, y: 52 }, { x: 2, y: 61 }, { x: 4, y: 78 }, { x: 5, y: 86 }],
        },
      ],
      xLabel: "Hours",
      yLabel: "Score (%)",
      trend: true,
    });
  });

  test("caps multi-series charts at five series in order", () => {
    const six = Array.from({ length: 6 }, (_, i) => `S${i + 1}: 0,${i} 1,${i + 1}`).join("; ");
    const parsed = parseChartAttrs({ "data-chart": "line", "data-series": six });
    expect(parsed?.kind).toBe("line");
    if (parsed?.kind === "line") {
      expect(parsed.series.map((s) => s.label)).toEqual(["S1", "S2", "S3", "S4", "S5"]);
    }
  });

  test("turns missing or unparseable numbers into an empty state and ignores unknown kinds", () => {
    const badCases: Array<[string, Record<string, string>]> = [
      ["bar missing values", { "data-chart": "bar", "data-title": "Empty bar", "data-labels": "A|B" }],
      ["bar non-numeric", { "data-chart": "bar", "data-title": "Bad bar", "data-labels": "A|B", "data-values": "1.5 nope" }],
      ["bar infinity", { "data-chart": "bar", "data-title": "Inf bar", "data-values": "1 Infinity" }],
      ["donut negative", { "data-chart": "donut", "data-title": "Neg donut", "data-labels": "A|B", "data-values": "3 -1" }],
      ["donut all zero", { "data-chart": "donut", "data-title": "Zero donut", "data-labels": "A|B", "data-values": "0 0" }],
      ["donut non-numeric", { "data-chart": "donut", "data-title": "Bad donut", "data-values": "two three" }],
      ["line single point", { "data-chart": "line", "data-title": "Short line", "data-series": "A: 1,2" }],
      ["line bad pair", { "data-chart": "line", "data-title": "Bad line", "data-series": "A: 1,2 3,bad" }],
      ["line triple value", { "data-chart": "line", "data-title": "Triple", "data-series": "A: 1,2,3 4,5,6" }],
      ["scatter bad pair", { "data-chart": "scatter", "data-title": "Bad scatter", "data-series": "A: x,y" }],
      ["scatter empty body", { "data-chart": "scatter", "data-title": "Empty scatter", "data-series": "A:" }],
    ];
    for (const [, attrs] of badCases) {
      expect(parseChartAttrs(attrs)).toEqual({ kind: "empty", title: attrs["data-title"] });
    }
    expect(parseChartAttrs({ "data-chart": "radar", "data-title": "Unknown" })).toBeNull();
  });
});

describe("genui sanitize for chart attributes", () => {
  test("admits data-center and empty data-trend and strips stray chart children", () => {
    const host = document.createElement("div");
    host.append(
      sanitize(
        `<div data-chart="donut" data-center="Total" data-values="1 2"><b>stray</b></div><div data-chart="scatter" data-series="1,2 3,4" data-trend></div>`,
        "p1",
      ),
    );
    const [donut, scatter] = Array.from(host.children);
    expect(donut.getAttribute("data-center")).toBe("Total");
    expect(donut.childNodes.length).toBe(0);
    expect(scatter.hasAttribute("data-trend")).toBe(true);
    expect(scatter.getAttribute("data-trend")).toBe("");
  });
});

describe("GenUIFence charts without OpenUI", () => {
  test("mounts bar, line, donut and scatter directly with tokens, tables and hover readouts", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const source = [
        `<div class="g-chart" data-chart="bar" data-title="Hours by subject" data-labels="QC|LinMod|Algs" data-values="6.5 1.5 4" data-unit="h" data-y-label="Hours"></div>`,
        `<div class="g-chart" data-chart="line" data-title="Quiz accuracy" data-series="Revisited: 1,64 2,71 3,86; Not revisited: 1,66 2,67 3,68" data-x-label="Week" data-y-label="Accuracy (%)" data-area></div>`,
        `<div class="g-chart" data-chart="donut" data-title="Study mix" data-labels="Reading|Practice|Review|Notes|Lab|Extra" data-values="2 3 1 1 1 2" data-unit="h"></div>`,
        `<div class="g-chart" data-chart="scatter" data-title="Practice vs score" data-series="Sem 1: 1,52 2,61 4,78; Sem 2: 1,55 3,72 5,89" data-x-label="Hours" data-y-label="Score" data-trend></div>`,
      ].join("\n");

      await act(async () => {
        root.render(<GenUIFence source={source} closed />);
      });

      const hosts = Array.from(mount.querySelectorAll(".genui [data-chart]"));
      expect(hosts).toHaveLength(4);

      // Bar: uses chart-1 fill, renders accessible data table, updates hover readout on pointer enter.
      const [bar, line, donut, scatter] = hosts;
      expect(bar.textContent).toContain("Hours by subject");
      const barRects = Array.from(bar.querySelectorAll("svg rect"));
      expect(barRects).toHaveLength(3);
      expect(barRects[0].getAttribute("class")).toContain("fill-chart-1");
      expect(bar.querySelector("table.sr-only")?.textContent).toContain("6.5 h");
      await act(async () => {
        barRects[0].dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      expect(bar.querySelector("[aria-live='polite']")?.textContent).toContain("QC 6.5 h");

      // Line: uses chart-1 and chart-2 strokes in order, area polygons, legend, and data table.
      expect(line.textContent).toContain("Quiz accuracy");
      const polylines = Array.from(line.querySelectorAll("svg polyline"));
      expect(polylines).toHaveLength(2);
      expect(polylines[0].getAttribute("class")).toContain("stroke-chart-1");
      expect(polylines[1].getAttribute("class")).toContain("stroke-chart-2");
      expect(line.querySelectorAll("svg polygon")).toHaveLength(2);
      expect(line.querySelector("ul")?.textContent).toContain("Revisited");
      expect(line.querySelector("ul")?.textContent).toContain("Not revisited");
      expect(line.querySelector("table.sr-only")?.textContent).toContain("86");

      // Donut: folds 6th slice into Other with chart-other stroke, lists values and shares, renders data table.
      expect(donut.textContent).toContain("Study mix");
      const segments = Array.from(donut.querySelectorAll("svg circle"));
      expect(segments).toHaveLength(5);
      expect(segments[0].getAttribute("class")).toContain("stroke-chart-1");
      expect(segments[4].getAttribute("class")).toContain("stroke-chart-other");
      expect(donut.textContent).toContain("Other");
      expect(donut.querySelector("table.sr-only")?.textContent).toContain("Practice");

      // Scatter: uses chart-1 and chart-2 dot fills, draws trend lines, updates hover readout, renders data table.
      expect(scatter.textContent).toContain("Practice vs score");
      const dots = Array.from(scatter.querySelectorAll("svg circle"));
      expect(dots).toHaveLength(6);
      expect(dots[0].getAttribute("class")).toContain("fill-chart-1");
      expect(dots[3].getAttribute("class")).toContain("fill-chart-2");
      expect(scatter.querySelectorAll("svg line")).toHaveLength(2);
      expect(scatter.querySelector("table.sr-only")?.textContent).toContain("Sem 2");
      await act(async () => {
        dots[0].dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      expect(scatter.querySelector("[aria-live='polite']")?.textContent).toContain("(1, 52)");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("unparseable chart draws its title and a muted No data line without broken SVG", () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    try {
      const html = renderToStaticMarkup(
        <ChartHost attrs={{ "data-chart": "bar", "data-title": "Broken series", "data-labels": "A|B", "data-values": "1 nope" }} />,
      );
      expect(html).toContain("Broken series");
      expect(html).toContain("No data");
      expect(html).toContain("text-muted-foreground");
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("More coming");
    } finally {
      ready.mockRestore();
    }
  });

  test("keeps the chart host node mounted across streaming deltas and fence closure", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const chartTag = `<div class="g-chart" data-chart="bar" data-title="Hours" data-labels="A|B" data-values="2 4"></div>`;
      await act(async () => {
        root.render(<GenUIFence source={chartTag} closed={false} />);
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      const hostDuringStream = mount.querySelector("[data-chart]");
      expect(hostDuringStream).not.toBeNull();
      expect(hostDuringStream?.querySelectorAll("svg rect").length).toBe(2);
      expect(hostDuringStream?.textContent).not.toContain("More coming");

      await act(async () => {
        root.render(<GenUIFence source={`${chartTag}\n<p class="g-cap">After</p>`} closed />);
      });
      expect(mount.querySelector("[data-chart]")).toBe(hostDuringStream);
      expect(mount.querySelector(".g-cap")?.textContent).toBe("After");
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });
});

describe("stored openui chart fences keep streaming and settled behaviour", () => {
  test("OpenUI charts still show streaming chrome while open and draw identically when settled", () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    try {
      const programs = [
        `root = Stack([Bar("Hours", ["Mon", "Tue"], [2, 3.5], "Hours", "h")])`,
        `root = Stack([Line("Trend", [Series("A", [{x: 1, y: 2}, {x: 2, y: 4}])], "x", "y")])`,
        `root = Stack([Donut("Mix", ["Read", "Do"], [2, 3], null, "h")])`,
        `root = Stack([Scatter("Points", [Series("G", [{x: 1, y: 2}, {x: 2, y: 5}])], "x", "y", true)])`,
        `root = Stack([Histogram("Spread", [1, 2, 2, 3, 4, 5], 3, "x", true)])`,
        `root = Stack([Distribution("Curve", [{x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 0}], [{from: 0.5, to: 1.5}], "x", true)])`,
        `root = Stack([Chart([{x: 0, y: 1}, {x: 1, y: 3}], "x", "y", "line")])`,
      ];

      for (const source of programs) {
        const streaming = renderToStaticMarkup(
          <Renderer response={source} library={library} isStreaming publishObservability={false}>
            <Renderer.Content />
          </Renderer>,
        );
        expect(streaming).toContain("More coming…");

        const settled = renderToStaticMarkup(
          <Renderer response={source} library={library} isStreaming={false} publishObservability={false}>
            <Renderer.Content />
          </Renderer>,
        );
        expect(settled).toContain("<section");
        expect(settled).toContain("<svg");
        expect(settled).not.toContain("More coming…");
        expect(settled).not.toContain("Not enough data");
      }

      // A streaming OpenUI chart with no data yet shows the shimmer, and settled shows its empty message.
      const emptyProg = `root = Stack([Bar("Pending", [], [])])`;
      const emptyStream = renderToStaticMarkup(
        <Renderer response={emptyProg} library={library} isStreaming publishObservability={false}>
          <Renderer.Content />
        </Renderer>,
      );
      expect(emptyStream).toContain("block-shimmer");
      const emptySettled = renderToStaticMarkup(
        <Renderer response={emptyProg} library={library} isStreaming={false} publishObservability={false}>
          <Renderer.Content />
        </Renderer>,
      );
      expect(emptySettled).toContain("Not enough data to draw.");
    } finally {
      ready.mockRestore();
    }
  });
});
