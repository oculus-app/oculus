import { scanMaths } from "./mathScan";

/** Clipboard type of a display formula's copy (a block field's, rendered
 *  markdown's): its source with the `$$` lines, for a paste outside maths
 *  (`components/documents/editor/live-preview/livePreview/edges.ts`). */
export const BLOCK_MATH_TYPE = "application/x-oculus-math-block";

/** Detect source delimiters before enabling remark-math or normalizing them.
 *  `\(` and `\[` count: the gate runs before [`normalizeMath`] rewrites them. */
const MATH = /\$|\\\(|\\\[/;
/** Code fences and inline code spans, left unchanged during normalization. */
const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

export function hasMath(text: string): boolean {
  // A regex cannot distinguish CommonMark code spans from escaped backticks;
  // leave that decision to the parser so a plugin gate never hides valid math.
  return MATH.test(text);
}

const DISPLAY = /\\\[([\s\S]+?)\\\]/g;
/** A line that is one `$$…$$` formula, which remark-math reads as inline. */
const DISPLAY_LINE = /^([ \t]*)\$\$((?:(?!\$\$)[^\n])+)\$\$[ \t]*$/gm;
const INLINE = /\\\(([\s\S]+?)\\\)/g;

/**
 * Rewrite the source so remark-math reads its maths as written:
 * - `\(…\)` / `\[…\]` become `$…$` / `$$…$$`: CommonMark treats `\(` as an
 *   escaped `(` and eats the backslash before remark-math sees a delimiter;
 * - a line holding only `$$…$$` becomes a display block, as the note editor
 *   draws it, and a `$$` sharing its line with TeX gets a line of its own;
 * - dollars are read as `scanMaths` reads them (prices, `\$` in a formula);
 * - a `|` in a formula in a table row becomes `\vert`.
 * Code spans and fences are left alone. Each rule answers replies that drew
 * wrong; `scripts/maths-lint.ts` replays the chat history to find more.
 */
export function normalizeMath(text: string): string {
  if (!hasMath(text)) return text;
  const repaired = text
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : inlineDollars(
            ownLines(
              part
                .replace(DISPLAY, (_, m) => `$$${m}$$`)
                .replace(INLINE, (_, m) => `$${m}$`)
                .replace(DISPLAY_LINE, (_, indent, m) => `\n${indent}$$\n${indent}${m}\n${indent}$$\n`),
            ),
          ),
    )
    .join("");
  return tablePipes(repaired);
}

/** A line opening a display block with TeX after its `$$`. */
const LOOSE_OPEN = /^([ \t]*)\$\$([^$]*)$/;

/** remark-math takes the text after an opening `$$` as an info string and
 *  drops it (`$$\begin{aligned}`), and only a line holding nothing but `$$`
 *  closes (`\end{aligned}$$ Then…` runs on to the end of the list item). */
function ownLines(text: string): string {
  if (!text.includes("$$")) return text;
  const out: string[] = [];
  let indent: string | null = null;
  for (const line of text.split("\n")) {
    if (indent === null) {
      const open = LOOSE_OPEN.exec(line);
      if (open) indent = open[1];
      if (open?.[2].trim()) out.push(`${open[1]}$$`, `${open[1]}${open[2].trimStart()}`);
      else out.push(line);
      continue;
    }
    const at = line.indexOf("$$");
    if (at < 0 || line.trim() === "$$") {
      out.push(line);
      if (at >= 0) indent = null;
      continue;
    }
    const before = line.slice(0, at);
    const after = line.slice(at + 2).trimStart();
    if (before.trim()) out.push(before);
    out.push(`${indent}$$`);
    if (after) out.push(`${indent}${after}`);
    indent = null;
  }
  return out.join("\n");
}

/** A `$` inside `$…$`: remark-math closes the formula on any `$`, `\$` too. */
const DOLLAR = "{\\char36}";
const ESCAPED_DOLLAR = /(?<!\\)((?:\\\\)*)\\\$/g;

/** Escape the dollars `scanMaths` reads as prose, and swap each `\$` in a
 *  `$…$` for [`DOLLAR`] (`restoreDollars` swaps it back before rendering). */
function inlineDollars(text: string): string {
  if (!text.includes("$")) return text;
  const { spans, literal } = scanMaths(text);
  const edits = literal.map((at) => ({ from: at, to: at + 1, insert: "\\$" }));
  for (const span of spans) {
    if (span.display || text[span.start + 1] === "$") continue;
    const inner = text.slice(span.start + 1, span.end - 1);
    const fixed = inner.replace(ESCAPED_DOLLAR, (_, run: string) => run + DOLLAR);
    if (fixed !== inner) edits.push({ from: span.start + 1, to: span.end - 1, insert: fixed });
  }
  edits.sort((a, b) => b.from - a.from);
  let out = text;
  for (const { from, to, insert } of edits) out = out.slice(0, from) + insert + out.slice(to);
  return out;
}

/** A formula's TeX as it was written, with `normalizeMath`'s `\$` stand-in undone. */
export function restoreDollars(tex: string): string {
  return tex.includes(DOLLAR) ? tex.split(DOLLAR).join("\\$") : tex;
}

const FENCE = /^[ \t]*(`{3,}|~{3,})/;
const DELIMITER_ROW = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const PIPE = /(?<!\\)\|/g;

/** GFM splits a table row at every `|` before maths is read, even between
 *  dollars, so a ket in a cell (`$|0\rangle$`) would break the row. */
function tablePipes(text: string): string {
  if (!text.includes("|")) return text;
  const lines = text.split("\n");
  let fence: string | null = null;
  let table = false;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const marker = FENCE.exec(line)?.[1][0];
    if (marker && (fence === null || fence === marker)) {
      fence = fence === null ? marker : null;
      table = false;
      continue;
    }
    if (fence !== null) continue;
    if (!line.trim()) {
      table = false;
      continue;
    }
    const next = lines[n + 1] ?? "";
    if (!table && line.includes("|") && next.includes("|") && DELIMITER_ROW.test(next)) table = true;
    if (table && line.includes("$") && !DELIMITER_ROW.test(line)) lines[n] = rowPipes(line);
  }
  return lines.join("\n");
}

/** A table row with each formula's `|` (but not `\|`) as `\vert`. */
function rowPipes(row: string): string {
  return row
    .split(/(`[^`\n]*`)/)
    .map((part, i) => {
      if (i % 2 === 1 || !part.includes("$")) return part;
      let out = part;
      for (const span of scanMaths(part).spans.reverse()) {
        const size = part[span.start + 1] === "$" ? 2 : 1;
        const inner = part.slice(span.start + size, span.end - size);
        const fixed = inner.replace(PIPE, "\\vert ");
        if (fixed !== inner) out = out.slice(0, span.start + size) + fixed + out.slice(span.end - size);
      }
      return out;
    })
    .join("");
}
