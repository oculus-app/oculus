import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
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

let sanitize: typeof import("@/components/markdown/genui/sanitize").sanitize;
let morph: typeof import("@/components/markdown/genui/morph").morph;
let BlockRuntime: typeof import("@/components/markdown/genui/runtime").BlockRuntime;
let ChartHost: typeof import("@/components/markdown/genui/ChartHost").ChartHost;
let GenUIFence: typeof import("@/components/markdown/genui/GenUIFence").GenUIFence;
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
  ({ morph } = await import("@/components/markdown/genui/morph"));
  ({ BlockRuntime } = await import("@/components/markdown/genui/runtime"));
  ({ ChartHost } = await import("@/components/markdown/genui/ChartHost"));
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
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

function sanitizeDom(markup: string, prefix = "p1"): HTMLDivElement {
  const host = document.createElement("div");
  host.append(sanitize(markup, prefix));
  return host;
}

describe("Finding 1: chart labels render plain text and maths only inside ui blocks", () => {
  const PAYLOADS = [
    "[x](https://example.com)",
    "![x](https://example.com/a.png)",
    `<a href="https://example.com">x</a>`,
    "courses/CS101/Course/Files/week-3.pdf",
  ];
  const SERIES_PAYLOADS = [
    "[x](/example)",
    "![x](/a.png)",
    `<a href="/example">x</a>`,
    "courses/CS101/Course/Files/week-3.pdf",
  ];
  const COMBINED = PAYLOADS.join(" ");

  test("bar, line, donut, scatter and empty charts never emit a, img or button under the chart host", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const esc = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
      const source = [
        `<div data-chart="bar" data-title="${esc(COMBINED)}" data-y-label="${esc(COMBINED)}" data-labels="${esc(PAYLOADS.join("|"))}" data-values="1 2 3 4"></div>`,
        `<div data-chart="line" data-title="${esc(COMBINED)}" data-x-label="${esc(COMBINED)}" data-y-label="${esc(COMBINED)}" data-series="${esc(`${SERIES_PAYLOADS[0]}: 1,2 2,4; ${SERIES_PAYLOADS[1]}: 1,3 2,5; ${SERIES_PAYLOADS[2]}: 1,1 2,2; ${SERIES_PAYLOADS[3]}: 1,4 2,6`)}"></div>`,
        `<div data-chart="donut" data-title="${esc(COMBINED)}" data-center="${esc(COMBINED)}" data-labels="${esc(PAYLOADS.join("|"))}" data-values="2 3 4 5"></div>`,
        `<div data-chart="scatter" data-title="${esc(COMBINED)}" data-x-label="${esc(COMBINED)}" data-y-label="${esc(COMBINED)}" data-series="${esc(`${SERIES_PAYLOADS[0]}: 1,2 2,4; ${SERIES_PAYLOADS[3]}: 1,3 2,5`)}"></div>`,
        `<div data-chart="bar" data-title="${esc(COMBINED)}"></div>`,
      ].join("\n");

      await act(async () => {
        root.render(<GenUIFence source={source} closed />);
      });

      const hosts = Array.from(mount.querySelectorAll(".genui [data-chart]"));
      expect(hosts).toHaveLength(5);
      const [bar, line, donut, scatter] = hosts;
      expect(bar.querySelectorAll("svg rect")).toHaveLength(4);
      expect(line.querySelectorAll("svg polyline")).toHaveLength(4);
      expect(line.textContent).not.toContain("No data");
      expect(donut.querySelectorAll("svg circle")).toHaveLength(4);
      expect(scatter.querySelectorAll("svg circle")).toHaveLength(4);
      expect(scatter.textContent).not.toContain("No data");

      // Exercise hover readouts on line and scatter to verify series names never emit anchors.
      await act(async () => {
        line.querySelector("div.absolute.inset-y-0")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        scatter.querySelector("svg circle")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      });
      expect(line.querySelector("[aria-live='polite']")?.textContent).toContain(SERIES_PAYLOADS[0]);
      expect(scatter.querySelector("[aria-live='polite']")?.textContent).toContain(SERIES_PAYLOADS[0]);

      for (const host of hosts) {
        expect(host.querySelectorAll("a, img, button")).toHaveLength(0);
        expect(host.textContent).toContain("[x](https://example.com)");
        expect(host.textContent).toContain("![x](https://example.com/a.png)");
        expect(host.textContent).toContain(`<a href="https://example.com">x</a>`);
        expect(host.textContent).toContain("courses/CS101/Course/Files/week-3.pdf");
      }
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("chart labels still render inline maths while refusing links inside TeX, and openui keeps InlineMd", () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    try {
      const uiHtml = renderToStaticMarkup(
        <ChartHost
          attrs={{
            "data-chart": "line",
            "data-title": "Rate $\\alpha + \\beta$ and $\\href{https://example.com}{x}$",
            "data-x-label": "Time $t$",
            "data-y-label": "Value $y(t)$",
            "data-series": "Curve $f_1$: 0,1 1,2; Curve $f_2$: 0,2 1,3",
          }}
        />,
      );
      expect(uiHtml).toContain("katex");
      expect(uiHtml).not.toMatch(/<(a|img|button)\b/i);

      // Stored openui charts keep today's rich InlineMd renderer.
      const openuiHtml = renderToStaticMarkup(
        <Renderer
          response={`root = Stack([Bar("**Bold** [link](https://example.com)", ["A", "B"], [1, 2], "Hours", "h")])`}
          library={library}
          isStreaming={false}
          publishObservability={false}
        >
          <Renderer.Content />
        </Renderer>,
      );
      expect(openuiHtml).toContain("md-inline");
      expect(openuiHtml).toContain("<strong");
      expect(openuiHtml).toContain(`href="https://example.com"`);
    } finally {
      ready.mockRestore();
    }
  });
});

describe("Finding 2: closed grammar per SVG presentation attribute and inline style", () => {
  test("drops CSS-escaped, commented and malformed external url references in SVG presentation attributes and styles", () => {
    const payloads = [
      `<svg><rect width="10" height="10" fill="\\75rl(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><rect width="10" height="10" clip-path="u\\72l(http://127.0.0.1:9/hit#a)"/></svg>`,
      `<svg><path d="M0 0 L10 10" marker-end="u\\72 l(http://127.0.0.1:9/hit#m)"/></svg>`,
      `<svg><rect width="10" height="10" fill="u/**/rl(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><rect width="10" height="10" fill="red;background:url(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><rect width="10" height="10" fill="red\x00"/></svg>`,
      `<svg><rect width="10" height="10" stroke="@import"/></svg>`,
      `<svg><rect width="10" height="10" fill="{red}"/></svg>`,
      `<svg><rect width="10" height="10" style="fill:url\\28 http://127.0.0.1:9/hit\\29"/></svg>`,
      `<svg><rect width="10" height="10" style="fill:u/**/rl(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><rect width="10" height="10" style="fill:url(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><rect width="10" height="10" clip-path="inset(10px)"/></svg>`,
      `<svg><path d="M0 0 url(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><polygon points="0,0 url(http://127.0.0.1:9/hit)"/></svg>`,
      `<svg><g transform="url(http://127.0.0.1:9/hit)"></g></svg>`,
      `<svg viewBox="0 0 100 url(x)"></svg>`,
    ];
    for (const p of payloads) {
      const host = sanitizeDom(p);
      const html = host.innerHTML;
      expect(html).not.toContain("127.0.0.1");
      expect(html).not.toContain("url(");
      expect(html).not.toContain("\\");
      expect(html).not.toContain("/*");
      expect(html).not.toContain("@import");
      expect(html).not.toContain("inset(");
      expect(html).not.toContain("fill=");
      expect(html).not.toContain("clip-path=");
      expect(html).not.toContain("marker-end=");
      expect(html).not.toContain("stroke=");
      expect(html).not.toContain("style=");
      expect(html).not.toContain("transform=");
      expect(html).not.toContain("viewbox=");
      expect(html).not.toContain("points=");
      if (p.includes("d=\"M0 0 url")) expect(html).not.toContain("d=");
    }
  });

  test("preserves valid SVG paint, refs, geometry, transforms, lengths, keywords and styles", () => {
    const host = sanitizeDom(
      `<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="g1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45)">
            <stop offset="0%" stop-color="#5e6ad2" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="rgba(10, 20, 30, 0.5)"/>
          </linearGradient>
          <clipPath id="c1"><rect x="0" y="0" width="100" height="100"/></clipPath>
          <marker id="m1" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0 0 L6 3 L0 6 Z"/></marker>
        </defs>
        <g transform="translate(10, 20) scale(1.2) rotate(-15 50 50)" clip-path="url(#c1)">
          <rect width="50%" height="40px" fill="url(#g1)" stroke="var(--color-brand, #5e6ad2)" stroke-width="1.5" stroke-dasharray="4 2" stroke-linecap="round" stroke-linejoin="miter" vector-effect="non-scaling-stroke"/>
          <polyline points="0,0 10,20 30,10" fill="none" stroke="hsl(220 50% 50% / 80%)" marker-end="url(#m1)"/>
          <text x="10 20" y="30" dx="1em" dy="-2px" font-size="12" font-weight="600" font-style="italic" text-anchor="middle" dominant-baseline="central" style="fill:url(#g1);color:var(--color-foreground)">Hi</text>
        </g>
      </svg>`,
      "b9",
    );
    expect(host.querySelector("svg")?.getAttribute("viewbox") ?? host.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 200 100");
    expect(host.querySelector("g")?.getAttribute("transform")).toBe("translate(10, 20) scale(1.2) rotate(-15 50 50)");
    expect(host.querySelector("g")?.getAttribute("clip-path")).toBe("url(#b9-c1)");
    const rect = host.querySelector("g rect")!;
    expect(rect.getAttribute("fill")).toBe("url(#b9-g1)");
    expect(rect.getAttribute("stroke")).toBe("var(--color-brand, #5e6ad2)");
    expect(rect.getAttribute("stroke-dasharray")).toBe("4 2");
    expect(host.querySelector("polyline")?.getAttribute("marker-end")).toBe("url(#b9-m1)");
    const text = host.querySelector("text")!;
    expect(text.getAttribute("x")).toBe("10 20");
    expect(text.getAttribute("style")).toBe("fill:url(#b9-g1);color:var(--color-foreground)");
  });
});

describe("Finding 3 (part): chart attributes survive only on HTML div", () => {
  test("strips data-chart and companions from SVG and non-div HTML elements", () => {
    const host = sanitizeDom(
      `<svg data-chart="bar" data-title="S" data-values="1 2"><g data-chart="line" data-series="A: 1,2 2,4"></g></svg>` +
        `<span data-chart="donut" data-labels="A|B" data-values="1 2" data-center="3" data-unit="h">x</span>` +
        `<div data-chart="bar" data-title="OK" data-labels="A|B" data-values="1 2"></div>`,
    );
    const svg = host.querySelector("svg")!;
    const g = host.querySelector("g")!;
    const span = host.querySelector("span")!;
    const div = host.querySelector("div")!;
    for (const el of [svg, g, span]) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.startsWith("data-")).toBe(false);
      }
    }
    expect(div.getAttribute("data-chart")).toBe("bar");
    expect(div.getAttribute("data-title")).toBe("OK");
    expect(div.getAttribute("data-values")).toBe("1 2");
  });
});

describe("Finding 4: paint containment, --v clamping and font-size bounds", () => {
  test("clamps --v to [0, 1], drops unknown custom properties, and bounds font-size", () => {
    const host = sanitizeDom(
      `<b class="pos" style="--v:20;--color-brand:red;--foo:2"></b>` +
        `<b class="neg" style="--v:-5"></b>` +
        `<b class="pos" style="--v:calc(99)"></b>` +
        `<span style="font-size:500px">big</span>` +
        `<span style="font-size:50rem">bigrem</span>` +
        `<span style="font-size:100vw">vw</span>` +
        `<svg><text font-size="999">huge</text></svg>`,
    );
    const bs = host.querySelectorAll("b");
    expect(bs[0].getAttribute("style")).toBe("--v:1");
    expect(bs[1].getAttribute("style")).toBe("--v:0");
    expect(bs[2].hasAttribute("style")).toBe(false);

    const spans = host.querySelectorAll("span");
    expect(spans[0].getAttribute("style")).toBe("font-size:40px");
    expect(spans[1].getAttribute("style")).toBe("font-size:2.5rem");
    expect(spans[2].hasAttribute("style")).toBe(false);

    expect(host.querySelector("svg text")?.getAttribute("font-size")).toBe("48");
  });

  test("genui.css applies paint containment with focus-ring gutter and clips amplitude bar tracks", () => {
    const css = readFileSync(new URL("../../../src/components/markdown/genui/genui.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.genui\s*\{[^}]*contain:\s*layout\s+paint/);
    expect(css).toMatch(/\.genui\s+\.trk\s*\{[^}]*overflow:\s*(hidden|clip)/);
  });
});

describe("Finding 6: text-valued attributes are exempt from URI scheme filtering", () => {
  test("preserves series named 'Observed data' and title containing 'javascript:'", async () => {
    const ready = spyOn(maths, "useMathsReady").mockReturnValue(true);
    const mount = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(mount);
    try {
      const source = `<div data-chart="line" data-title="javascript: the good parts" data-series="Observed data: 1,2 2,4"></div>`;
      await act(async () => {
        root.render(<GenUIFence source={source} closed />);
      });
      const host = mount.querySelector(".genui [data-chart]")!;
      expect(host.getAttribute("data-series")).toBe("Observed data: 1,2 2,4");
      expect(host.getAttribute("data-title")).toBe("javascript: the good parts");
      expect(host.textContent).toContain("javascript: the good parts");
      expect(host.textContent).not.toContain("No data");
      expect(host.querySelectorAll("svg polyline")).toHaveLength(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      mount.remove();
      ready.mockRestore();
    }
  });

  test("keeps title, aria-label and behaviour attributes containing scheme-like words", () => {
    const host = sanitizeDom(
      `<div title="javascript: the good parts" aria-label="data: summary" data-choice="mode" data-value="data:a"><button data-option="data:a">A</button></div>`,
    );
    const div = host.firstElementChild!;
    expect(div.getAttribute("title")).toBe("javascript: the good parts");
    expect(div.getAttribute("aria-label")).toBe("data: summary");
    expect(div.getAttribute("data-value")).toBe("data:a");
    expect(div.querySelector("button")?.getAttribute("data-option")).toBe("data:a");
  });
});

describe("Finding 8 (part): empty data-show stays present so runtime hides it", () => {
  test("preserves empty data-show attribute and hides the element via BlockRuntime", () => {
    const root = document.createElement("div");
    morph(root, sanitize(`<div data-show="">hidden</div>`, "p1"));
    const child = root.firstElementChild!;
    expect(child.hasAttribute("data-show")).toBe(true);
    expect(child.getAttribute("data-show")).toBe("");
    const rt = new BlockRuntime(root);
    rt.apply();
    expect(child.hasAttribute("data-off")).toBe(true);
    rt.destroy();
  });
});

describe("Finding 11: closed class vocabulary, closed ARIA allowlist and brief examples", () => {
  test("drops arbitrary g-* classes and non-allowlisted aria-* attributes", () => {
    const host = sanitizeDom(
      `<div class="g g-row g-custom g-chart fixed" aria-label="Keep" aria-hidden="true" aria-labelledby="other" aria-describedby="app-el" aria-controls="x">ok</div>`,
    );
    const div = host.firstElementChild!;
    expect(div.className).toBe("g g-row");
    expect(div.getAttribute("aria-label")).toBe("Keep");
    expect(div.getAttribute("aria-hidden")).toBe("true");
    expect(div.hasAttribute("aria-labelledby")).toBe(false);
    expect(div.hasAttribute("aria-describedby")).toBe(false);
    expect(div.hasAttribute("aria-controls")).toBe(false);
  });

  test("every ```ui example in HARNESS.template.md passes the sanitiser with nothing stripped", () => {
    const brief = readFileSync(new URL("../../../src-tauri/templates/HARNESS.template.md", import.meta.url), "utf8");
    const examples = [...brief.matchAll(/```ui\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThanOrEqual(2);

    for (const example of examples) {
      const raw = document.createElement("template");
      raw.innerHTML = example;
      const cleaned = sanitizeDom(example, "h1");

      const rawEls = Array.from(raw.content.querySelectorAll("*"));
      const cleanedEls = Array.from(cleaned.querySelectorAll("*")).filter(
        (el) => !el.classList.contains("genui-math") && !el.closest(".genui-math"),
      );
      expect(cleanedEls.length).toBe(rawEls.length);

      for (let i = 0; i < rawEls.length; i++) {
        expect(cleanedEls[i].localName.toLowerCase()).toBe(rawEls[i].localName.toLowerCase());
        for (const attr of Array.from(rawEls[i].attributes)) {
          const got = cleanedEls[i].getAttribute(attr.name);
          expect(got).not.toBeNull();
          if (attr.name === "class") {
            expect(got!.split(/\s+/).filter(Boolean)).toEqual(attr.value.split(/\s+/).filter(Boolean));
          } else if (attr.name !== "id") {
            expect(got).toBe(attr.value);
          }
        }
      }
    }
  });
});
