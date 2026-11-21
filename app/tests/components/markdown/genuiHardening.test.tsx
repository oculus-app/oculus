import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";

const dom = parseHTML("<!doctype html><html><body></body></html>");
const globals = {
  window: dom.window,
  document: dom.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
};
const previous = Object.getOwnPropertyDescriptors(globalThis);

let sanitize: typeof import("@/components/markdown/genui/sanitize").sanitize;
let morph: typeof import("@/components/markdown/genui/morph").morph;
let BlockRuntime: typeof import("@/components/markdown/genui/runtime").BlockRuntime;
let cleanStyle: typeof import("@/components/markdown/genui/allow").cleanStyle;
let cleanAttr: typeof import("@/components/markdown/genui/allow").cleanAttr;
let allowedAttr: typeof import("@/components/markdown/genui/allow").allowedAttr;
let allowedClass: typeof import("@/components/markdown/genui/allow").allowedClass;

beforeAll(async () => {
  Object.assign(globalThis, globals);
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
  ({ morph } = await import("@/components/markdown/genui/morph"));
  ({ BlockRuntime } = await import("@/components/markdown/genui/runtime"));
  ({ cleanStyle, cleanAttr, allowedAttr, allowedClass } = await import("@/components/markdown/genui/allow"));
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

describe("Finding 7: BlockRuntime.apply skips typeset [data-tex] descendants", () => {
  test("visits none of a formula's descendants while still clearing stale runtime attributes on ordinary elements", () => {
    const derivation = `<div class="g g-derive">
      <div class="r"><span class="n">1</span><span class="l">$S$</span><span>$= \\sum (y_i - \\beta_0 - \\beta_1 x_i)^2$</span><span class="why">Sum of squared residuals</span></div>
      <div class="r"><span class="n">2</span><span class="l">$\\beta_0$</span><span>$= {}$<span class="hl">$\\bar y - \\beta_1 \\bar x$</span></span><span class="why">Set $\\partial S/\\partial \\beta_0 = 0$</span></div>
      <div class="r"><span class="n">3</span><span class="l"></span><span><span class="fin">$\\hat\\beta_1 = \\dfrac{\\sum(x_i-\\bar x)(y_i-\\bar y)}{\\sum(x_i-\\bar x)^2}$</span></span><span class="why">Substitute line 2</span></div>
    </div>`;

    const root = document.createElement("div");
    morph(root, sanitize(derivation, "p1"));

    const formulaWrappers = Array.from(root.querySelectorAll("span[data-tex]"));
    expect(formulaWrappers.length).toBeGreaterThanOrEqual(5);

    const formulaDescendants = formulaWrappers.flatMap((w) => Array.from(w.querySelectorAll("*")));
    expect(formulaDescendants.length).toBeGreaterThan(100);

    // Instrument every formula descendant to fail if apply() walks into it.
    let visitedFormulaDescendants = 0;
    for (const el of formulaDescendants) {
      const origHas = el.hasAttribute.bind(el);
      el.hasAttribute = ((name: string) => {
        visitedFormulaDescendants++;
        return origHas(name);
      }) as typeof el.hasAttribute;
    }

    // Plant stale runtime-owned attributes on ordinary elements outside formulas.
    const ordinaryRow = root.querySelector(".r")!;
    const ordinaryReason = root.querySelector(".why")!;
    ordinaryRow.setAttribute("role", "radiogroup");
    ordinaryRow.setAttribute("inert", "");
    ordinaryReason.setAttribute("data-off", "");
    ordinaryReason.setAttribute("tabindex", "0");

    const rt = new BlockRuntime(root);
    rt.apply();

    expect(visitedFormulaDescendants).toBe(0);
    expect(ordinaryRow.hasAttribute("role")).toBe(false);
    expect(ordinaryRow.hasAttribute("inert")).toBe(false);
    expect(ordinaryReason.hasAttribute("data-off")).toBe(false);
    expect(ordinaryReason.hasAttribute("tabindex")).toBe(false);
    rt.destroy();
  });
});

describe("Finding 8: SVG multiline geometry canonicalisation and control character rejection", () => {
  test("canonicalises spaces, tabs and newlines in numeric, list, path and transform SVG attributes", () => {
    const host = sanitizeDom(
      `<svg viewBox="0 0\n100\t100" width=" 200px\n" height="\t100\r\n">
        <defs>
          <linearGradient id="g1" gradientTransform="rotate(45\n50\t50)">
            <stop offset="\t50%\n" stop-color="#5e6ad2" stop-opacity="\n0.5\t"/>
          </linearGradient>
          <marker id="m1" markerWidth=" 6\n" markerHeight="\t6 " refX="\n3\t" refY=" 3\r\n" orient="\nauto\t">
            <path d="M 0 0\n  L 6\t3\r\n  L 0 6 Z"/>
          </marker>
        </defs>
        <g transform="translate(10,\n  20)\tscale(1.5)">
          <rect x="0\n" y="\t0" width="50" height="50" stroke-width=" 1.5\t" stroke-dasharray="4\t2\n6" opacity="\n0.9\t" pathLength=" 100\n"/>
          <polyline points="0,0\n10,20\t30,10\r\n40,0"/>
          <text x="10\n20\t30" y="30\r\n40" dx="1\n2" dy="0\t1" font-size="\n12px\t">Hi</text>
        </g>
      </svg>`,
      "p1",
    );

    const svg = host.querySelector("svg")!;
    expect(svg.getAttribute("viewbox") ?? svg.getAttribute("viewBox")).toBe("0 0 100 100");
    expect(svg.getAttribute("width")).toBe("200px");
    expect(svg.getAttribute("height")).toBe("100");

    const grad = host.querySelector("defs")?.firstElementChild!;
    expect(grad.getAttribute("gradienttransform") ?? grad.getAttribute("gradientTransform")).toBe("rotate(45 50 50)");

    const stop = host.querySelector("stop")!;
    expect(stop.getAttribute("offset")).toBe("50%");
    expect(stop.getAttribute("stop-opacity")).toBe("0.5");

    const marker = host.querySelector("marker")!;
    expect(marker.getAttribute("markerwidth") ?? marker.getAttribute("markerWidth")).toBe("6");
    expect(marker.getAttribute("refx") ?? marker.getAttribute("refX")).toBe("3");
    expect(marker.getAttribute("orient")).toBe("auto");

    expect(host.querySelector("path")?.getAttribute("d")).toBe("M 0 0 L 6 3 L 0 6 Z");
    expect(host.querySelector("g")?.getAttribute("transform")).toBe("translate(10, 20) scale(1.5)");

    const rect = host.querySelector("rect")!;
    expect(rect.getAttribute("stroke-width")).toBe("1.5");
    expect(rect.getAttribute("stroke-dasharray")).toBe("4 2 6");
    expect(rect.getAttribute("opacity")).toBe("0.9");
    expect(rect.getAttribute("pathlength") ?? rect.getAttribute("pathLength")).toBe("100");

    expect(host.querySelector("polyline")?.getAttribute("points")).toBe("0,0 10,20 30,10 40,0");

    const text = host.querySelector("text")!;
    expect(text.getAttribute("x")).toBe("10 20 30");
    expect(text.getAttribute("y")).toBe("30 40");
    expect(text.getAttribute("dx")).toBe("1 2");
    expect(text.getAttribute("dy")).toBe("0 1");
    expect(text.getAttribute("font-size")).toBe("12px");
  });

  test("rejects other control characters everywhere including d and points", () => {
    const controls = ["\x00", "\x07", "\x0b", "\x0c", "\x1f", "\x7f"];
    for (const ch of controls) {
      expect(cleanAttr("d", `M0 0${ch}L10 10`, "p1", true)).toBe("");
      expect(cleanAttr("points", `0,0${ch}10,10`, "p1", true)).toBe("");
      expect(cleanAttr("viewbox", `0 0${ch}100 100`, "p1", true)).toBe("");
      expect(cleanAttr("stroke-dasharray", `4${ch}2`, "p1", true)).toBe("");
      expect(cleanAttr("transform", `translate(1${ch}2)`, "p1", true)).toBe("");
      expect(cleanAttr("x", `10${ch}20`, "p1", true)).toBe("");
      expect(cleanAttr("fill", `red${ch}`, "p1", true)).toBe("");
      expect(cleanStyle(`color:red${ch}`, "p1")).toBe("");
    }
  });
});

describe("Finding 4: font-size drops compounding em and % units", () => {
  test("drops em and % in inline styles and SVG font-size while keeping bounded px, pt, rem and SVG unitless", () => {
    const host = sanitizeDom(
      `<div style="font-size:250%"><span style="font-size:250%">compound</span></div>` +
        `<span style="font-size:2em">em</span>` +
        `<span style="font-size:1.5EM">EM</span>` +
        `<span style="font-size:500px">px</span>` +
        `<span style="font-size:40pt">pt</span>` +
        `<span style="font-size:10rem">rem</span>` +
        `<svg><text font-size="250%">a</text><text font-size="2em">b</text><text font-size="12">c</text><text font-size="100px">d</text><text font-size="50pt">e</text><text font-size="5rem">f</text></svg>`,
    );

    const div = host.querySelector("div")!;
    expect(div.hasAttribute("style")).toBe(false);
    const spans = host.querySelectorAll("span");
    expect(spans[0].hasAttribute("style")).toBe(false);
    expect(spans[1].hasAttribute("style")).toBe(false);
    expect(spans[2].hasAttribute("style")).toBe(false);
    expect(spans[3].getAttribute("style")).toBe("font-size:40px");
    expect(spans[4].getAttribute("style")).toBe("font-size:30pt");
    expect(spans[5].getAttribute("style")).toBe("font-size:2.5rem");

    const texts = host.querySelectorAll("svg text");
    expect(texts[0].hasAttribute("font-size")).toBe(false);
    expect(texts[1].hasAttribute("font-size")).toBe(false);
    expect(texts[2].getAttribute("font-size")).toBe("12");
    expect(texts[3].getAttribute("font-size")).toBe("48px");
    expect(texts[4].getAttribute("font-size")).toBe("36pt");
    expect(texts[5].getAttribute("font-size")).toBe("2.5rem");
  });
});

describe("Nit 10: allow.ts uses own-key lookups and rejects inherited object keys", () => {
  const PROTO_KEYS = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];

  test("rejects inherited Object.prototype keys as style properties, attributes, classes and units", () => {
    for (const key of PROTO_KEYS) {
      expect(cleanStyle(`${key}:1`, "p1")).toBe("");
      expect(cleanStyle(`${key}:0.5; --v:0.5`, "p1")).toBe("--v:0.5");
      expect(cleanStyle(`font-size:10${key}`, "p1")).toBe("");
      expect(cleanAttr("font-size", `10${key}`, "p1", true)).toBe("");
      expect(allowedAttr(key, false, "div")).toBe(false);
      expect(allowedAttr(key, true, "svg")).toBe(false);
      expect(allowedClass(key)).toBe(false);
    }

    const host = sanitizeDom(
      `<div class="constructor __proto__ toString hasOwnProperty g" style="constructor:1;__proto__:1;toString:1;hasOwnProperty:1" constructor="1" toString="1" hasOwnProperty="1">ok</div>`,
    );
    const el = host.firstElementChild!;
    expect(el.className).toBe("g");
    expect(el.hasAttribute("style")).toBe(false);
    for (const key of PROTO_KEYS) {
      expect(el.hasAttribute(key)).toBe(false);
      expect(el.hasAttribute(key.toLowerCase())).toBe(false);
    }
  });
});
