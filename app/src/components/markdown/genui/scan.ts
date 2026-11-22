import { scanMaths } from "@/lib/markdown/mathScan";

type TagMatch =
  | { kind: "open"; name: string; selfClosing: boolean; end: number }
  | { kind: "close"; name: string; end: number }
  | { kind: "comment" | "decl"; end: number }
  | { kind: "unclosed" };

export type ScanResult = {
  /** Recognised formula spans in maths-eligible text runs, in source order. */
  formulas: { start: number; end: number }[];
  /** Earliest offset to cut an unclosed trailing construct, or `-1` when complete. */
  cutAt: number;
};

const UNCLOSED_ENTITY = /&(?:#(?:[xX][0-9a-fA-F]*|[0-9]*)|[a-zA-Z0-9]*)$/;
const HTML_ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});/;

const isWs = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";

/**
 * Shared markup scanner for streaming prefix repair and pre-parse formula
 * protection. Tracks comments, tags, quoted attributes, `<svg>`/`<code>`/`<kbd>`
 * depth and per-run maths spans; an unmatched `$` becomes literal when a
 * complete tag or comment closes its run, and is held back only in the last
 * still-open text run.
 */
export function scanMarkup(s: string): ScanResult {
  const formulas: { start: number; end: number }[] = [];
  let svgDepth = 0;
  let codeDepth = 0;
  let kbdDepth = 0;
  let runStart = 0;
  let i = 0;

  const flushRun = (runEnd: number, closedByTag: boolean): number => {
    if (runEnd <= runStart) return -1;
    const eligible = svgDepth === 0 && codeDepth === 0 && kbdDepth === 0;
    let cut = -1;
    const text = s.slice(runStart, runEnd);
    if (eligible && text.includes("$")) {
      const { spans, open } = scanMaths(text);
      for (const sp of spans) {
        formulas.push({ start: runStart + sp.start, end: runStart + sp.end });
      }
      if (!closedByTag && open >= 0) {
        cut = runStart + open;
      }
    }
    if (!closedByTag) {
      const m = UNCLOSED_ENTITY.exec(text);
      if (m) {
        const entityAt = runStart + m.index;
        cut = cut < 0 ? entityAt : Math.min(cut, entityAt);
      }
    }
    return cut;
  };

  while (i < s.length) {
    if (s[i] !== "<") {
      i++;
      continue;
    }
    const tag = matchTagOrComment(s, i);
    if (!tag) {
      i++;
      continue;
    }
    if (tag.kind === "unclosed") {
      const runCut = flushRun(i, false);
      return { formulas, cutAt: runCut >= 0 ? Math.min(runCut, i) : i };
    }
    flushRun(i, true);
    if (tag.kind === "open" && !tag.selfClosing) {
      if (tag.name === "svg") svgDepth++;
      else if (tag.name === "code") codeDepth++;
      else if (tag.name === "kbd") kbdDepth++;
    } else if (tag.kind === "close") {
      if (tag.name === "svg") svgDepth = Math.max(0, svgDepth - 1);
      else if (tag.name === "code") codeDepth = Math.max(0, codeDepth - 1);
      else if (tag.name === "kbd") kbdDepth = Math.max(0, kbdDepth - 1);
    }
    i = tag.end;
    runStart = i;
  }

  return { formulas, cutAt: flushRun(s.length, false) };
}

/**
 * Escapes `<`, `>` and bare `&` inside every recognised formula span before
 * handing markup to `<template>.innerHTML`, so inequalities such as `$x<y$`
 * survive HTML tokenisation without altering ordinary text or double-escaping
 * existing character references.
 */
export function protectMaths(markup: string): string {
  if (!markup.includes("$")) return markup;
  const { formulas } = scanMarkup(markup);
  if (formulas.length === 0) return markup;

  let out = "";
  let pos = 0;
  let changed = false;
  for (const { start, end } of formulas) {
    const raw = markup.slice(start, end);
    const escaped = escapeFormulaHtml(raw);
    if (escaped !== raw) changed = true;
    out += markup.slice(pos, start) + escaped;
    pos = end;
  }
  if (!changed) return markup;
  return out + markup.slice(pos);
}

function escapeFormulaHtml(raw: string): string {
  if (!/[<>&]/.test(raw)) return raw;
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "<") {
      out += "&lt;";
    } else if (c === ">") {
      out += "&gt;";
    } else if (c === "&") {
      const m = HTML_ENTITY.exec(raw.slice(i));
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else {
        out += "&amp;";
      }
    } else {
      out += c;
    }
  }
  return out;
}

/** Classifies `<` at `i` as a complete tag/comment, an unclosed prefix at EOF, or plain text (`null`). */
function matchTagOrComment(s: string, i: number): TagMatch | null {
  if (s.startsWith("<!--", i)) {
    const end = s.indexOf("-->", i + 4);
    return end < 0 ? { kind: "unclosed" } : { kind: "comment", end: end + 3 };
  }
  if (i + 1 === s.length) return { kind: "unclosed" };
  const next = s[i + 1];
  if (next === "!" || next === "?") {
    const tail = s.slice(i);
    if (tail === "<!" || tail === "<!-" || tail === "<?") return { kind: "unclosed" };
    let j = i + 2;
    let quote: '"' | "'" | null = null;
    while (j < s.length) {
      const ch = s[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ">") {
        return { kind: "decl", end: j + 1 };
      }
      j++;
    }
    return { kind: "unclosed" };
  }
  if (next === "/") {
    if (i + 2 === s.length) return { kind: "unclosed" };
    if (!/[a-zA-Z]/.test(s[i + 2])) return null;
    let j = i + 2;
    while (j < s.length && /[a-zA-Z0-9-]/.test(s[j])) j++;
    const name = s.slice(i + 2, j).toLowerCase();
    while (j < s.length && isWs(s[j])) j++;
    if (j === s.length) return { kind: "unclosed" };
    return s[j] === ">" ? { kind: "close", name, end: j + 1 } : null;
  }
  if (!/[a-zA-Z]/.test(next)) return null;

  let j = i + 1;
  while (j < s.length && /[a-zA-Z0-9-]/.test(s[j])) j++;
  const name = s.slice(i + 1, j).toLowerCase();
  let needSpace = true;

  while (j < s.length) {
    const wsStart = j;
    while (j < s.length && isWs(s[j])) j++;
    if (j > wsStart) needSpace = false;
    if (j === s.length) return { kind: "unclosed" };

    const ch = s[j];
    if (ch === ">") return { kind: "open", name, selfClosing: false, end: j + 1 };
    if (ch === "/") {
      j++;
      while (j < s.length && isWs(s[j])) j++;
      if (j === s.length) return { kind: "unclosed" };
      return s[j] === ">" ? { kind: "open", name, selfClosing: true, end: j + 1 } : null;
    }
    if (needSpace) return null;
    if (!/[a-zA-Z_:]/.test(ch)) return null;

    while (j < s.length && /[a-zA-Z0-9_.:-]/.test(s[j])) j++;
    const afterAttr = j;
    while (j < s.length && isWs(s[j])) j++;
    if (j === s.length) return { kind: "unclosed" };

    if (s[j] === "=") {
      j++;
      while (j < s.length && isWs(s[j])) j++;
      if (j === s.length) return { kind: "unclosed" };
      const q = s[j];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, j + 1);
        if (close < 0) return { kind: "unclosed" };
        j = close + 1;
        needSpace = false;
      } else {
        const valStart = j;
        while (j < s.length && !/[\s"'=<>`]/.test(s[j])) j++;
        if (j === valStart) return null;
        if (j === s.length) return { kind: "unclosed" };
        needSpace = true;
      }
    } else {
      needSpace = j === afterAttr;
    }
  }
  return { kind: "unclosed" };
}
