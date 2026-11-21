import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import { hasMath, normalizeMath } from "@/lib/markdown/math";
import { splitMaths } from "@/components/markdown/genui/maths";
import { repairPrefix } from "@/components/markdown/genui/repair";

const dom = parseHTML("<!doctype html><html><body></body></html>");
const globals = {
  window: dom.window,
  document: dom.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Text: dom.window.Text,
};
const previous = Object.getOwnPropertyDescriptors(globalThis);

let sanitize: typeof import("@/components/markdown/genui/sanitize").sanitize;

beforeAll(async () => {
  Object.assign(globalThis, globals);
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
});

afterAll(() => {
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function sanitizeDom(markup: string, prefix = "m1"): HTMLDivElement {
  const host = document.createElement("div");
  host.append(sanitize(markup, prefix));
  return host;
}

const replyProc = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkRehype);

function replyMaths(input: string): { tex: string; display: boolean }[] {
  const norm = hasMath(input) ? normalizeMath(input) : input;
  const hast = replyProc.runSync(replyProc.parse(norm));
  const out: { tex: string; display: boolean }[] = [];
  const walk = (n: { type?: string; properties?: { className?: unknown }; children?: unknown[]; value?: string }) => {
    const cls = Array.isArray(n.properties?.className) ? n.properties.className : [];
    if (n.type === "element" && (cls.includes("math-inline") || cls.includes("math-display"))) {
      out.push({
        tex: (n.children ?? []).map((c) => (c as { value?: string }).value ?? "").join(""),
        display: cls.includes("math-display"),
      });
      return;
    }
    for (const ch of n.children ?? []) walk(ch as typeof n);
  };
  walk(hast as unknown as Parameters<typeof walk>[0]);
  return out;
}

function blockMaths(input: string): { tex: string; display: boolean }[] {
  return splitMaths(input)
    .pieces.filter((p): p is { tex: string; display: boolean } => "tex" in p)
    .map(({ tex, display }) => ({ tex, display }));
}

function mathEligibleText(root: Node): string {
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
}

describe("finding 1: formula text is protected from HTML tokenisation", () => {
  test("preserves inequalities and following markup on both closed and streaming paths", () => {
    const input = `<p>$x<y$ <b>then</b></p>`;
    for (const markup of [input, repairPrefix(input)]) {
      const host = sanitizeDom(markup);
      const math = host.querySelector("[data-tex]");
      expect(math?.getAttribute("data-tex")).toBe("Ix<y");
      expect(math?.querySelector(".katex")).not.toBeNull();
      expect(host.querySelector(".katex-error")).toBeNull();
      expect(host.querySelector("p > b")?.textContent).toBe("then");
    }
  });

  test("preserves multiple inequalities, TeX relations and a formula directly followed by a real tag", () => {
    const both = sanitizeDom(`<p>$a<b$ and $c>d$ and $x \\le y$</p>`);
    expect(Array.from(both.querySelectorAll("[data-tex]")).map((n) => n.getAttribute("data-tex"))).toEqual([
      "Ia<b",
      "Ic>d",
      "Ix \\le y",
    ]);
    expect(both.querySelector(".katex-error")).toBeNull();

    const adjacent = sanitizeDom(`<p>$a<b$<b>x</b></p>`);
    expect(adjacent.querySelector("[data-tex]")?.getAttribute("data-tex")).toBe("Ia<b");
    expect(adjacent.querySelector("p > b")?.textContent).toBe("x");

    const spaced = sanitizeDom(`<p>$a<b + c$ <b>then</b></p>`);
    expect(spaced.querySelector("[data-tex]")?.getAttribute("data-tex")).toBe("Ia<b + c");
    expect(spaced.querySelector("p > b")?.textContent).toBe("then");
  });

  test("preserves bare & inside aligned environments without double-escaping existing entities", () => {
    const aligned = `<div class="g">\n$$\n\\begin{aligned}\na &= 1 \\\\\nb &lt &= 2\n\\end{aligned}\n$$\n</div>`;
    const alignedHost = sanitizeDom(aligned);
    const alignedMath = alignedHost.querySelector("[data-tex]");
    expect(alignedMath?.getAttribute("data-tex")).toBe("D\\begin{aligned}\na &= 1 \\\\\nb &lt &= 2\n\\end{aligned}");
    expect(alignedMath?.querySelector(".katex")).not.toBeNull();
    expect(alignedHost.querySelector(".katex-error")).toBeNull();

    const entityHost = sanitizeDom(`<p>$x &lt; y$ and $c &gt; d$ and $u &#60; v$ and $p &#x3C; q$</p>`);
    expect(Array.from(entityHost.querySelectorAll("[data-tex]")).map((n) => n.getAttribute("data-tex"))).toEqual([
      "Ix < y",
      "Ic > d",
      "Iu < v",
      "Ip < q",
    ]);
    expect(entityHost.querySelector(".katex-error")).toBeNull();
  });

  test("leaves < in ordinary non-formula text to the HTML parser and never turns hostile formulas into markup", () => {
    const plain = `<p>3 < 5</p>`;
    const native = document.createElement("template");
    native.innerHTML = plain;
    const host = sanitizeDom(plain);
    expect(host.innerHTML).toBe(native.innerHTML);
    expect(host.querySelector("p")?.textContent).toBe("3 < 5");

    const mixed = sanitizeDom(`<p>3 < 5 and $x<y$</p>`);
    expect(mixed.querySelector("[data-tex]")?.getAttribute("data-tex")).toBe("Ix<y");
    expect(mixed.querySelector("p")?.firstChild?.nodeValue).toBe("3 < 5 and ");

    const hostilePayloads = [
      `<p>$<script>window.__pwned=1</script>$</p>`,
      `<p>$<img src=x onerror="window.__pwned=1">$</p>`,
      `<p>$<img/src=x/onerror="window.__pwned=1">$</p>`,
      `<p>$x<y$ <script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"></p>`,
    ];
    for (const payload of hostilePayloads) {
      const h = sanitizeDom(payload);
      expect(h.querySelector("script")).toBeNull();
      expect(h.querySelector("img")).toBeNull();
      expect((window as unknown as { __pwned?: unknown }).__pwned).toBeUndefined();
    }
  });
});

describe("finding 2: streaming repair tracks dollars within one eligible text run", () => {
  test("never pairs a dollar across an HTML tag into an attribute value", () => {
    const prefix = `<p>$x</p><span title="$`;
    const repaired = repairPrefix(prefix);
    expect(repaired).toBe(`<p>$x</p>`);
    expect(repaired).not.toContain("<span");

    const complete = `<p>$x</p><span title="$1">hi</span>`;
    expect(repairPrefix(complete)).toBe(complete);
    const host = sanitizeDom(complete);
    expect(host.querySelector("p")?.textContent).toBe("$x");
    expect(host.querySelector("span")?.getAttribute("title")).toBe("$1");
    expect(host.querySelector("span")?.textContent).toBe("hi");
  });

  test("finalises an unmatched dollar when its text run ends so later paragraphs still draw", () => {
    const prefix = `<p>Cost $5</p><p>Result`;
    expect(repairPrefix(prefix)).toBe(prefix);
    const host = sanitizeDom(repairPrefix(prefix));
    const ps = Array.from(host.querySelectorAll("p"));
    expect(ps.map((p) => p.textContent)).toEqual(["Cost $5", "Result"]);
    expect(host.querySelector("[data-tex]")).toBeNull();

    // Still holds back an unclosed formula in the LAST, still-open text run.
    expect(repairPrefix(`<p>Cost $5</p><p>Value $x + 1`)).toBe(`<p>Cost $5</p><p>Value `);
    expect(repairPrefix(`<p>$x<y`)).toBe(`<p>`);
  });

  test("treats $5 and $10 identically to the reply pipeline and ignores dollars in comments, attributes, code, kbd and svg", () => {
    const priceText = "It costs $5 and $10";
    const host = sanitizeDom(`<p>${priceText}</p>`);
    const rendered = Array.from(host.querySelectorAll("[data-tex]")).map((el) => {
      const raw = el.getAttribute("data-tex")!;
      return { tex: raw.slice(1), display: raw[0] === "D" };
    });
    expect(rendered).toEqual(replyMaths(priceText));

    const nonEligible = [
      `<p>$x<!-- $ -->y</p>`,
      `<p>$x<code>$</code>y</p>`,
      `<p>$x<kbd>$</kbd>y</p>`,
      `<p>$x<svg><text>$</text></svg>y</p>`,
      `<p>$x<span title="$">y</span></p>`,
    ];
    for (const markup of nonEligible) {
      expect(repairPrefix(markup)).toBe(markup);
      expect(sanitizeDom(markup).querySelector("[data-tex]")).toBeNull();
    }
  });

  test("keeps split tint markup as three separate formulas across closed and streaming prefixes", () => {
    const tint = `<div class="r"><span>$= \\sum x_i \\bigl(y_i -{}$<span class="hl">$\\bar y$</span>\${} - \\beta_1 x_i\\bigr)$</span></div>`;
    const host = sanitizeDom(tint);
    expect(Array.from(host.querySelectorAll("[data-tex]")).map((e) => e.getAttribute("data-tex"))).toEqual([
      "I= \\sum x_i \\bigl(y_i -{}",
      "I\\bar y",
      "I{} - \\beta_1 x_i\\bigr)",
    ]);
    for (let len = 1; len <= tint.length; len++) {
      const repaired = repairPrefix(tint.slice(0, len));
      const h = sanitizeDom(repaired);
      expect(mathEligibleText(h)).not.toContain("$");
      expect(mathEligibleText(h)).not.toContain("<");
    }
  });
});

describe("finding 6: splitMaths matches the reply remark-math pipeline on spans and display mode", () => {
  const PARITY_INPUTS = [
    "$x$",
    "$ x $",
    "$x$2",
    "$ not maths$",
    "$x $",
    "$ x$",
    "\\$5",
    "\\$5 and \\$10",
    "$5 and $10",
    "It costs $5 and $10",
    "\\\\$x$",
    "\\\\\\$x$",
    "\\\\\\\\$x$",
    "\\$$x$",
    "word $$x$$ end",
    "$$x$$ $$y$$",
    "$$x$$ and $$y$$",
    "$$x$$",
    "  $$x$$  ",
    "$$\nx\n$$",
    "  $$\n  x\n  $$",
    "$$\nx\n\ny\n$$",
    "before\n$$\nx\n$$\nafter",
    "before\n$$x$$\nafter",
    "a $$b$$ c\n$$d$$\ne $$f$$ g",
    "$a\nb$",
    "$a\n\nb$",
    "$a\n   \nb$",
    "word $$a\n\nb$$ end",
    "word $$\\text{cost $5}$$ end",
    "$$\\text{cost $5}$$",
    "$\\text{cost $5}$",
    "word $$\\text{a {b $ c} d}$$ end",
    "$$a$b$$",
    "$a$$b$",
    "$$x $y$",
    "$x $$y$$",
    "$$$x$$$",
    "$$$\nx\n$$$$",
    "cost $",
    "word \\\\$$x$$ end",
    "word \\\\\\$$x$$ end",
    "\\\\$$x$$",
    "$x < y$ and $c > d$",
    "$$\n\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}\n$$",
  ];

  test("agrees with remark-math on every span and inline/display mode across 45 inputs", () => {
    expect(PARITY_INPUTS.length).toBeGreaterThanOrEqual(30);
    for (const input of PARITY_INPUTS) {
      expect({ input, got: blockMaths(input) }).toEqual({ input, got: replyMaths(input) });
    }
  });

  test("blank line finalises an earlier unclosed inline dollar for streaming open offset", () => {
    expect(splitMaths("$a\n\nb")).toEqual({ pieces: [{ text: "$a\n\nb" }], open: -1 });
    expect(splitMaths("$a\n\n$b")).toEqual({ pieces: [{ text: "$a\n\n$b" }], open: 4 });
    expect(repairPrefix("<p>$a\n\nb")).toBe("<p>$a\n\nb");
    expect(repairPrefix("<p>$a\n\n$b")).toBe("<p>$a\n\n");
  });

  test("every prefix of inequality fixtures leaks no raw $, half tag or half entity", () => {
    const fixtures = [
      `<p>$x<y$ <b>then</b></p>`,
      `<p>$a<b$ and $c>d$</p>`,
      `<p>$a<b$<b>x</b></p>`,
      `<div class="g">\n$$\n\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}\n$$\n</div>`,
    ];
    for (const fixture of fixtures) {
      for (let len = 1; len <= fixture.length; len++) {
        const repaired = repairPrefix(fixture.slice(0, len));
        const host = sanitizeDom(repaired);
        const text = mathEligibleText(host);
        expect(text).not.toContain("$");
        expect(text).not.toContain("<");
        expect(repaired).not.toMatch(/&#?[a-z0-9]*$/i);
      }
    }
  });

  test("the two HARNESS.template.md ```ui examples sanitise with nothing stripped and typeset every formula", () => {
    const brief = readFileSync(new URL("../../../src-tauri/templates/HARNESS.template.md", import.meta.url), "utf8");
    const examples = [...brief.matchAll(/```ui\n([\s\S]*?)\n```/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThanOrEqual(2);
    for (const example of examples) {
      const host = sanitizeDom(example, "h1");
      expect(mathEligibleText(host)).not.toContain("$");
      expect(host.querySelectorAll("[data-tex]").length).toBeGreaterThan(0);
      expect(host.querySelector(".katex-error")).toBeNull();
    }
  });
});
