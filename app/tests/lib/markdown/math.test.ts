import { describe, expect, test } from "bun:test";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { normalizeMath, restoreDollars } from "@/lib/markdown/math";

const reply = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** The formulas a reply renders, as `D:`/`I:` and their TeX. */
function maths(text: string): string[] {
  const out: string[] = [];
  visit(reply.parse(normalizeMath(text)), (node) => {
    if (node.type === "math" || node.type === "inlineMath") {
      out.push(`${node.type === "math" ? "D" : "I"}:${restoreDollars(node.value)}`);
    }
  });
  return out;
}

describe("normalizeMath", () => {
  test("a line holding one $$ formula becomes a display block", () => {
    expect(normalizeMath("part.\n$$a=b$$\nwhere")).toBe("part.\n\n$$\na=b\n$$\n\nwhere");
  });

  test("$$ inside a sentence, two formulas on a line and code stay as written", () => {
    for (const text of ["x $$a$$ y", "$$a$$ and $$b$$", "`$$e$$`", "$$\nd\n$$"]) {
      expect(normalizeMath(text)).toBe(text);
    }
  });

  test("bracket delimiters still become dollars", () => {
    expect(normalizeMath("\\(x\\) and \\[y\\] here")).toBe("$x$ and $$y$$ here");
  });

  test("a $$ sharing its line with TeX gets a line of its own, in a list item too", () => {
    const item = [
      "2. one for each $k$:",
      "   $$\\begin{aligned}",
      "   a &= 1 \\\\",
      "   b &= 2",
      "   \\end{aligned}$$",
      "   Add those, and $a + b$ is it.",
    ].join("\n");
    expect(maths(item)).toEqual(["I:k", "D:\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}", "I:a + b"]);
    expect(maths("$$\n\\begin{aligned}a\\end{aligned}$$\nafter $x$")).toEqual(["D:\\begin{aligned}a\\end{aligned}", "I:x"]);
  });

  test("prices are prose, not a formula between two of them", () => {
    expect(maths("about $1M to build and about $5M a year")).toEqual([]);
    expect(maths("from $5-$10, and $x$ per unit")).toEqual(["I:x"]);
    expect(maths("the $\\$4$ budget, $2$ assets")).toEqual(["I:\\$4", "I:2"]);
    expect(normalizeMath("It costs $5 and $10")).toBe("It costs \\$5 and \\$10");
  });

  test("an escaped dollar inside a formula stays in it", () => {
    expect(maths("push $\\$$ first, then $\\epsilon,\\$\\to\\epsilon$ pops it")).toEqual([
      "I:\\$",
      "I:\\epsilon,\\$\\to\\epsilon",
    ]);
    expect(maths("- $q_0\\to q_1$: $\\epsilon,\\epsilon\\to\\$$")).toEqual(["I:q_0\\to q_1", "I:\\epsilon,\\epsilon\\to\\$"]);
    expect(normalizeMath("costs \\$5, `$\\$$`")).toBe("costs \\$5, `$\\$$`");
  });

  test("a ket in a table cell keeps its row", () => {
    const table = ["| Gate | Operator |", "| --- | --- |", "| CNOT | $|0\\rangle\\langle 0| \\otimes I$ |", "| norm | $\\|x\\|$ |"].join("\n");
    expect(maths(table)).toEqual(["I:\\vert 0\\rangle\\langle 0\\vert  \\otimes I", "I:\\|x\\|"]);
    expect(normalizeMath("$|0\\rangle$ outside a table")).toBe("$|0\\rangle$ outside a table");
    const fenced = "```\n| a | b |\n|---|---|\n| $|x|$ | y |\n```";
    expect(normalizeMath(fenced)).toBe(fenced);
  });
});
