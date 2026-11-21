import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EXPLAIN_PROGRAMS } from "../../../fixtures/openui-explain";
import stored from "../../../fixtures/openui-stored.json";
const globals = globalThis as { window?: unknown; document?: unknown };
const added = (["window", "document"] as const).filter((k) => !(k in globals));
for (const k of added) globals[k] = Object.assign(new EventTarget(), { documentElement: { style: {} } });
afterAll(() => { for (const k of added) delete globals[k]; });
const { Renderer } = await import("@openuidev/react-lang");
const { library } = await import("@/components/markdown/openui/library");
const { parseProgram, streamVerdict } = await import("@/components/markdown/openui/parse");
const { StreamingPending } = await import("@/components/markdown/openui/Streaming");
const maths = await import("@/lib/maths/useMathsReady");
const { regions } = await import("@/components/markdown/openui/components/charts/Distribution");
const { area, binValues, densityMean, points } = await import("@/components/markdown/openui/components/charts/data");
const { tickLabel } = await import("@/components/markdown/openui/components/charts/scale");
const { allowedPlan } = await import("@/components/markdown/openui/components/layout/Button");

function render(source: string, streaming = false) {
  const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
  try { return renderToStaticMarkup(<StreamingPending.Provider value={streamVerdict(source).pending}>
    <Renderer response={source} library={library} isStreaming={streaming} publishObservability={false}><Renderer.Content /></Renderer>
  </StreamingPending.Provider>); } finally { ready.mockRestore(); }
}

describe("explain kit", () => {
  for (const [name, source] of Object.entries(EXPLAIN_PROGRAMS)) test(`${name}: settled plus every character prefix`, () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      const verdict = parseProgram(source);
      if (!verdict.ok) throw new Error(verdict.errors.join("; "));
      const html = render(source);
      expect(html).not.toContain("More coming");
      expect(html).not.toContain("Not enough data");
      expect(html.length).toBeGreaterThan(100);
      for (let end = 0; end <= source.length; end++) {
        const partial = render(source.slice(0, end), true);
        expect(partial).not.toMatch(/(?:NaN|Infinity)(?:%|"|px)/);
        expect(partial).not.toContain("Couldn't draw");
      }
      expect(error.mock.calls).toEqual([]);
    } finally { ready.mockRestore(); error.mockRestore(); }
  });
  test("all 25 stored fences parse and render", () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    try {
      expect(stored).toHaveLength(25);
      for (const source of stored) {
        const verdict = parseProgram(source);
        if (!verdict.ok) throw new Error(verdict.errors.join("; "));
        expect(render(source)).toContain("<section");
      }
    } finally { ready.mockRestore(); }
  });
  test("single series has no legend; comparisons get one", () => {
    expect(render('root = Stack([Line("One", [1,2,3])])')).not.toContain("<ul");
    expect(render(EXPLAIN_PROGRAMS.Line)).toContain("n = 30");
    expect(render(EXPLAIN_PROGRAMS.Line)).toContain("<ul");
  });
  test("shading merges overlapping intervals and preserves the probability", () => {
    const merged = regions([{ from: 1, to: 3 }, { from: 2, to: 4 }, { from: 6, to: 7 }]);
    expect(merged).toEqual([{ from: 1, to: 4 }, { from: 6, to: 7 }]);
    expect(area([{ x: 0, y: 1 }, { x: 5, y: 1 }], merged[0].from, merged[0].to)).toBe(3);
    expect(densityMean([{ x: 0, y: 0 }, { x: 2, y: 1 }])).toBeCloseTo(4 / 3);
  });
  test("raw data, constant bins and fractional ticks stay readable", () => {
    expect(points([1, 3])).toEqual([{ x: 0, y: 1 }, { x: 1, y: 3 }]);
    expect(binValues([2, 2, 2], 5).reduce((s, b) => s + b.count, 0)).toBe(3);
    expect(tickLabel(2.5, 2.5)).toBe("2.5");
  });
  test("button actions fail closed for URLs, Reset and custom steps", () => {
    expect(allowedPlan({ steps: [{ type: "set" }, { type: "run" }, { type: "continue_conversation" }] })?.steps).toHaveLength(3);
    for (const type of ["open_url", "reset", "custom"]) expect(allowedPlan({ steps: [{ type: "set" }, { type }] })).toBeUndefined();
  });
  test("stored reply combining Panel, Stat, Histogram and every other untaught component validates and renders", () => {
    const combined = `root = Stack([panel, cols, list, table, badge, progress, tabs, callout, bar, line, scatter, donut, dist, legacy])
panel = Panel("Wait summary", [Stat("Mean wait", 1.03, "min", "400 trials"), Histogram("Spread", [0.2, 0.5, 0.8, 1.1, 1.4, 2.0], 5, "Wait (min)", true)])
cols = Columns([Panel("A", [Text("Left")]), Panel("B", [Text("Right")])])
list = List(["First", "Second"], true)
table = Table(["Col", "Val"], [["A", 1]])
badge = Badge("Ready", "success")
progress = Progress("Done", 3, 5)
tabs = Tabs([Tab("One", [Text("Tab one")])])
callout = Callout("Remember units.", "tip", "Note")
bar = Bar("Hours", ["Mon", "Tue"], [2, 3], "Time (h)", "h")
line = Line("Trend", [Series("S1", [{x:0,y:1},{x:1,y:2}])], "x", "y")
scatter = Scatter("Pairs", [{x:1,y:2},{x:2,y:4}], "x", "y", true)
donut = Donut("Mix", ["A", "B"], [3, 1], null, "h")
dist = Distribution("Density", [{x:0,y:0},{x:1,y:1},{x:2,y:0}], [{from:0.5,to:1.5}], "x", true)
legacy = Chart([{x:0,y:1},{x:1,y:3}], "x", "y", "bar")`;
    const verdict = parseProgram(combined);
    if (!verdict.ok) throw new Error(verdict.errors.join("; "));
    const html = render(combined);
    expect(html).toContain("Wait summary");
    expect(html).toContain("Mean wait");
    expect(html).toContain("Spread");
    expect(html).toContain("Remember units.");
    expect(html).toContain("<table");
    expect(html).toContain("<svg");
    expect(html).not.toContain("Couldn't draw");
  });
  test("the prompt teaches only the supported action path and points inline explanation to ui", async () => {
    const { generateOculusUiPrompt } = await import("@/components/markdown/openui/prompt");
    const prompt = generateOculusUiPrompt();
    expect(prompt).toContain("belongs in a `ui` fence");
    expect(prompt).toContain("@Run(query)");
    expect(prompt).not.toContain('Button("View", @OpenUrl');
    expect(prompt).not.toContain("Chart(points:");
    expect(prompt).not.toContain("### Other");
    expect(prompt).toContain("Only scored Quiz questions require exactly one correct option");
  });
  test("standalone controls are disabled while streaming", () => {
    for (const name of ["Slider", "Input", "Select", "Toggle", "Button", "Tabs"] as const) expect(render(EXPLAIN_PROGRAMS[name], true)).toContain("disabled");
  });
});
