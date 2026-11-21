import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { act } from "react";
import type { Root } from "react-dom/client";
import { contrast } from "@/lib/ui/themes";
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
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number,
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
};
const previous = Object.getOwnPropertyDescriptors(globalThis);

let sanitize: typeof import("@/components/markdown/genui/sanitize").sanitize;
let morph: typeof import("@/components/markdown/genui/morph").morph;
let GenUIFence: typeof import("@/components/markdown/genui/GenUIFence").GenUIFence;
let createRoot: typeof import("react-dom/client").createRoot;

beforeAll(async () => {
  Object.assign(globalThis, globals);
  Object.assign(dom.window, {
    requestAnimationFrame: globals.requestAnimationFrame,
    cancelAnimationFrame: globals.cancelAnimationFrame,
  });
  ({ sanitize } = await import("@/components/markdown/genui/sanitize"));
  ({ morph } = await import("@/components/markdown/genui/morph"));
  ({ GenUIFence } = await import("@/components/markdown/genui/GenUIFence"));
  ({ createRoot } = await import("react-dom/client"));
});

afterAll(() => {
  for (const key of Object.keys(globals)) {
    const descriptor = previous[key as keyof typeof globalThis];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const LEAST_SQUARES = `<div class="g g-derive">
  <div class="r"><span class="n">1</span><span class="l">$S$</span><span>$= \\sum (y_i - \\beta_0 - \\beta_1 x_i)^2$</span><span class="why">The sum of squared residuals</span></div>
  <div class="r"><span class="n">2</span><span class="l">$\\frac{\\partial S}{\\partial \\beta_0}$</span><span>$= -2 \\sum (y_i - \\beta_0 - \\beta_1 x_i) = 0$</span><span class="why">Differentiate in the intercept, set to zero</span></div>
  <div class="r"><span class="n">3</span><span class="l">$\\beta_0$</span><span>$= {}$<span class="hl">$\\bar y - \\beta_1 \\bar x$</span></span><span class="why">Divide by $n$, rearrange</span></div>
  <div class="r"><span class="n">4</span><span class="l">$\\frac{\\partial S}{\\partial \\beta_1}$</span><span>$= -2 \\sum x_i (y_i - \\beta_0 - \\beta_1 x_i) = 0$</span><span class="why">The same for the slope</span></div>
  <div class="r"><span class="n">5</span><span class="l">$0$</span><span>$= \\sum x_i \\bigl(y_i -{}$<span class="hl">$\\bar y + \\beta_1 \\bar x$</span>\${} - \\beta_1 x_i\\bigr)$</span><span class="why">Put line 3 in for $\\beta_0$</span></div>
  <div class="r"><span class="n">6</span><span class="l"></span><span><span class="fin">$\\beta_1 = \\dfrac{\\sum (x_i - \\bar x)(y_i - \\bar y)}{\\sum (x_i - \\bar x)^2}$</span></span><span class="why">Solve for the slope. Deviations sum to zero, so $x_i$ can become $x_i - \\bar x$</span></div>
</div>`;

function sanitizeDom(markup: string, prefix = "d1"): HTMLDivElement {
  const host = document.createElement("div");
  host.append(sanitize(markup, prefix));
  return host;
}

/** Plain text outside rendered maths nodes. */
function nonMathText(root: Node): string {
  let out = "";
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
    } else if (node.nodeType === Node.ELEMENT_NODE && !(node as Element).hasAttribute("data-tex")) {
      out += nonMathText(node);
    }
  }
  return out;
}

describe("derivation block markup and sanitisation", () => {
  test("preserves g-derive structure, classes, tinted terms and boxed result while stripping disallowed classes", () => {
    const host = sanitizeDom(
      LEAST_SQUARES.replace(`class="g g-derive"`, `class="g g-derive fixed inset-0"`),
    );
    const derive = host.querySelector(".g-derive");
    expect(derive).not.toBeNull();
    expect(derive?.className).toBe("g g-derive");

    const rows = derive!.querySelectorAll(".r");
    expect(rows.length).toBe(6);
    expect(Array.from(rows).map((r) => r.querySelector(".n")?.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(rows[0].querySelector(".l [data-tex]")?.getAttribute("data-tex")).toBe("IS");
    expect(rows[2].querySelector(".hl [data-tex]")?.getAttribute("data-tex")).toBe("I\\bar y - \\beta_1 \\bar x");
    expect(rows[4].querySelector(".hl [data-tex]")?.getAttribute("data-tex")).toBe("I\\bar y + \\beta_1 \\bar x");
    expect(rows[5].querySelector(".l")?.textContent).toBe("");
    expect(rows[5].querySelector(".fin [data-tex]")?.getAttribute("data-tex")).toBe(
      "I\\beta_1 = \\dfrac{\\sum (x_i - \\bar x)(y_i - \\bar y)}{\\sum (x_i - \\bar x)^2}",
    );
    expect(host.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(14);
    expect(host.querySelector(".katex-error")).toBeNull();
  });
});

describe("split-and-tinted formula spacing", () => {
  test("keeps {} joins on both sides of .hl so binary and relation operators keep their spacing", () => {
    const splitRow = sanitizeDom(
      `<div class="r"><span>$= \\sum x_i \\bigl(y_i -{}$<span class="hl">$\\bar y + \\beta_1 \\bar x$</span>\${} - \\beta_1 x_i\\bigr)$</span></div>`,
    );
    const formulas = Array.from(splitRow.querySelectorAll("[data-tex]"));
    expect(formulas.map((f) => f.getAttribute("data-tex"))).toEqual([
      "I= \\sum x_i \\bigl(y_i -{}",
      "I\\bar y + \\beta_1 \\bar x",
      "I{} - \\beta_1 x_i\\bigr)",
    ]);

    // With {} on each side, the minus before and after the split is a binary
    // operator (.mbin), whereas without {} KaTeX collapses it to unary (.mord).
    const beforeMinus = formulas[0].querySelectorAll(".katex-html .mbin");
    expect(beforeMinus.length).toBe(1);
    expect(beforeMinus[0].textContent).toBe("\u2212");

    const afterMinus = formulas[2].querySelectorAll(".katex-html .mbin");
    expect(afterMinus.length).toBe(1);
    expect(afterMinus[0].textContent).toBe("\u2212");

    const broken = sanitizeDom(
      `<div class="r"><span>$= \\sum x_i \\bigl(y_i -$</span><span>$- \\beta_1 x_i\\bigr)$</span></div>`,
    );
    const brokenFormulas = Array.from(broken.querySelectorAll("[data-tex]"));
    expect(brokenFormulas[0].querySelectorAll(".katex-html .mbin").length).toBe(0);
    expect(brokenFormulas[1].querySelectorAll(".katex-html .mbin").length).toBe(0);

    // An equals sign joined to a tinted right-hand side keeps its thick relation space via `{}`.
    const relRow = sanitizeDom(
      `<div class="r"><span>$= {}$<span class="hl">$\\bar y - \\beta_1 \\bar x$</span></span></div>`,
    );
    const relEq = relRow.querySelector("[data-tex]")!;
    expect(relEq.getAttribute("data-tex")).toBe("I= {}");
    expect(relEq.querySelector(".katex-html .mspace")?.getAttribute("style")).toContain("0.2778em");
    expect(sanitizeDom(`<span>$=$</span>`).querySelector(".katex-html .mspace")).toBeNull();
  });
});

describe("streaming derivation holds back unclosed maths", () => {
  test("holds back a lone trailing $ as well as a half-written formula while keeping literal trailing $ in closed text", () => {
    expect(repairPrefix(`<div class="r"><span class="l">$`)).toBe(`<div class="r"><span class="l">`);
    expect(repairPrefix(`<span class="hl">$`)).toBe(`<span class="hl">`);
    expect(repairPrefix(`<span class="hl">$\\bar y + \\beta_1`)).toBe(`<span class="hl">`);
    expect(repairPrefix(`<span class="fin">$\\beta_1 = \\dfrac{\\sum`)).toBe(`<span class="fin">`);
    expect(repairPrefix(`<span class="why">Divide by $`)).toBe(`<span class="why">Divide by `);
    expect(repairPrefix(`<span class="why">Divide by $n$, and $x`)).toBe(`<span class="why">Divide by $n$, and `);

    // Closed text still preserves a literal trailing dollar sign.
    const { pieces, open } = splitMaths("cost $");
    expect(open).toBe(5);
    expect(pieces).toEqual([{ text: "cost $" }]);
  });

  test("never leaks raw $ or TeX source at any character prefix of the six-step derivation", () => {
    for (let i = 1; i <= LEAST_SQUARES.length; i++) {
      const repaired = repairPrefix(LEAST_SQUARES.slice(0, i));
      const host = sanitizeDom(repaired);
      const visible = nonMathText(host);
      expect(visible).not.toContain("$");
      expect(visible).not.toContain("\\");
      expect(host.querySelector(".katex-error")).toBeNull();
    }
  });

  test("morphs line by line without replacing earlier rows or rendered formulas", async () => {
    const lines = LEAST_SQUARES.split("\n");
    const host = document.body.appendChild(document.createElement("div"));
    const root: Root = createRoot(host);

    await act(async () => {
      root.render(<GenUIFence source={lines.slice(0, 3).join("\n")} closed={false} />);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });

    const row1 = host.querySelector(".g-derive .r");
    const row1Math = row1?.querySelector("[data-tex]");
    expect(row1).not.toBeNull();
    expect(row1Math).not.toBeNull();

    // Stream remaining rows and close the fence.
    await act(async () => {
      root.render(<GenUIFence source={LEAST_SQUARES} closed />);
    });

    const rows = host.querySelectorAll(".g-derive .r");
    expect(rows.length).toBe(6);
    expect(rows[0]).toBe(row1);
    expect(rows[0].querySelector("[data-tex]")).toBe(row1Math);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  test("morph keeps existing formula nodes across incremental partial prefixes", () => {
    const live = document.createElement("div");
    const prefix3 = LEAST_SQUARES.split("\n").slice(0, 4).join("\n");
    morph(live, sanitize(repairPrefix(prefix3), "m1"));
    const firstRow = live.querySelector(".g-derive .r")!;
    const firstHl = live.querySelector(".hl")!;

    morph(live, sanitize(LEAST_SQUARES, "m1"));
    expect(live.querySelector(".g-derive .r")).toBe(firstRow);
    expect(live.querySelector(".hl")).toBe(firstHl);
  });
});

describe("derive.css tokens and layout rules", () => {
  const css = readFileSync(new URL("../../../src/components/markdown/genui/derive.css", import.meta.url), "utf8");
  const lightCss = readFileSync(new URL("../../../src/styles/colors.css", import.meta.url), "utf8");
  const darkCss = readFileSync(new URL("../../../src/styles/dark.css", import.meta.url), "utf8");

  const tokensIn = (text: string) =>
    Object.fromEntries([...text.matchAll(/(--color-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

  test("uses semantic tokens only, tabular numerals, a container query and no vertical scroll", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\b(rgb|hsl|oklch|oklab)\s*\(/i);
    expect(css).not.toMatch(/font-mono|monospace/i);
    expect(css).toContain("var(--color-brand-muted)");
    expect(css).toContain("var(--color-brand)");
    expect(css).toContain("var(--color-border-subtle)");
    expect(css).toContain("var(--color-muted-foreground)");
    expect(css).toContain("tabular-nums");
    expect(css).toContain("@container");
    expect(css).toContain("display: table");
    expect(css).not.toMatch(/overflow-y\s*:\s*(auto|scroll)/);
  });

  test("hl tint and fin border have readable contrast in both light and dark", () => {
    const light = tokensIn(lightCss);
    const dark = { ...light, ...tokensIn(darkCss) };
    for (const tokens of [light, dark]) {
      expect(contrast(tokens["--color-foreground"], tokens["--color-brand-muted"])).toBeGreaterThanOrEqual(7);
      expect(contrast(tokens["--color-brand"], tokens["--color-card"])).toBeGreaterThanOrEqual(3);
    }
  });
});
