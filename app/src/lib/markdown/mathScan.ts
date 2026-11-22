/**
 * The one reading of `$` delimiters that replies (`normalizeMath`, then
 * remark-math) and `ui` blocks (`components/markdown/genui/`) share. Beyond
 * remark-math's own rules it adds two that remark-math cannot express, which
 * `normalizeMath` writes into the source so remark-math agrees:
 * - a price is prose: a single `$` whose span would start with a digit and end
 *   in whitespace or just before a digit (`$5 and $10`, `$5-$10`) is literal;
 * - `\$` inside `$…$` is a dollar in the formula, not its closing delimiter.
 */

/** A run of block text: plain, or a formula. */
export type Piece = { text: string } | { tex: string; display: boolean };

/** Source span of a recognised formula inside a text run. */
export type MathSpan = { start: number; end: number; tex: string; display: boolean };

/** Matches `normalizeMath`'s single-line display rule (`lib/markdown/math.ts`). */
const DISPLAY_LINE = /^\$\$((?:(?!\$\$)[^\r\n])+)\$\$[ \t]*$/;
const FENCE_OPEN = /^(\${2,})[ \t]*$/;

/**
 * Splits a text run on display (`$$…$$` on its own line or fenced `$$\n…\n$$`)
 * and inline (`$…$`, `$$…$$`) maths using the reply pipeline's rules: an odd
 * backslash run before `$` escapes it while an even run does not, `$$…$$`
 * inside a line is inline, and a blank line ends an inline candidate.
 * `open` is the earliest unclosed delimiter that could still close on more input.
 */
export function scanMaths(text: string): { pieces: Piece[]; spans: MathSpan[]; open: number; literal: number[] } {
  const pieces: Piece[] = [];
  const spans: MathSpan[] = [];
  /** Where a single `$` read as prose is (a price, or one that never
   *  closes), for `normalizeMath` to escape. */
  const literal: number[] = [];
  let plain = "";
  let i = 0;
  let open = -1;

  while (i < text.length) {
    if (i === 0 || text[i - 1] === "\n" || text[i - 1] === "\r") {
      let wsEnd = i;
      while (wsEnd < text.length && (text[wsEnd] === " " || text[wsEnd] === "\t")) wsEnd++;
      if (text[wsEnd] === "$" && text[wsEnd + 1] === "$") {
        let lineEnd = wsEnd;
        while (lineEnd < text.length && text[lineEnd] !== "\n" && text[lineEnd] !== "\r") lineEnd++;
        const rest = text.slice(wsEnd, lineEnd);

        const dm = DISPLAY_LINE.exec(rest);
        if (dm) {
          plain += text.slice(i, wsEnd);
          if (plain) {
            pieces.push({ text: plain });
            plain = "";
          }
          const tex = dm[1];
          pieces.push({ tex, display: true });
          spans.push({ start: wsEnd, end: lineEnd, tex, display: true });
          i = lineEnd;
          continue;
        }

        const fm = FENCE_OPEN.exec(rest);
        if (fm) {
          const openSize = fm[1].length;
          if (lineEnd === text.length) {
            if (open < 0) open = wsEnd;
            plain += text.slice(i, lineEnd);
            i = lineEnd;
            continue;
          }
          const bodyStart = text[lineEnd] === "\r" && text[lineEnd + 1] === "\n" ? lineEnd + 2 : lineEnd + 1;
          const close = findFenceClose(text, bodyStart, openSize);
          if (close) {
            const rawBody = close.lineStart > bodyStart ? stripTrailingEol(text.slice(bodyStart, close.lineStart)) : "";
            const tex = stripIndent(rawBody, wsEnd - i);
            plain += text.slice(i, wsEnd);
            if (plain) {
              pieces.push({ text: plain });
              plain = "";
            }
            pieces.push({ tex, display: true });
            spans.push({ start: wsEnd, end: close.lineEnd, tex, display: true });
            i = close.lineEnd;
            continue;
          }
          if (open < 0) open = wsEnd;
          plain += text.slice(i, wsEnd + openSize);
          i = wsEnd + openSize;
          continue;
        }
      }
      if (wsEnd > i) {
        plain += text.slice(i, wsEnd);
        i = wsEnd;
        if (i >= text.length) break;
      }
    }

    const c = text[i];
    if (c === "\\") {
      let bs = 0;
      while (text[i + bs] === "\\") bs++;
      if (text[i + bs] === "$") {
        if (bs % 2 === 1) {
          plain += "\\".repeat((bs - 1) / 2) + "$";
          i += bs + 1;
        } else {
          plain += "\\".repeat(bs / 2);
          i += bs;
        }
        continue;
      }
      plain += text.slice(i, i + bs);
      i += bs;
      continue;
    }

    if (c !== "$") {
      plain += c;
      i++;
      continue;
    }

    let size = 0;
    while (text[i + size] === "$") size++;
    const start = i + size;
    const { close, hitBlank } = findInlineClose(text, start, size);
    if (close < 0) {
      if (!hitBlank && open < 0) open = i;
      if (size === 1) literal.push(i);
      plain += text.slice(i, start);
      i = start;
      continue;
    }
    if (size === 1 && isPrice(text, start, close)) {
      literal.push(i);
      plain += "$";
      i = start;
      continue;
    }
    if (plain) {
      pieces.push({ text: plain });
      plain = "";
    }
    const tex = stripPadding(text.slice(start, close));
    pieces.push({ tex, display: false });
    spans.push({ start: i, end: close + size, tex, display: false });
    i = close + size;
  }

  if (plain) pieces.push({ text: plain });
  return { pieces, spans, open, literal };
}

/** A `$…$` candidate that reads as prices: `$5 and $`, `$5-$10`. */
function isPrice(text: string, start: number, close: number): boolean {
  if (!/[0-9]/.test(text[start] ?? "")) return false;
  return /\s/.test(text[close - 1]) || /[0-9]/.test(text[close + 1] ?? "");
}

/** Whether the `$` at `at` follows an odd run of backslashes, back to `from`. */
function escaped(text: string, from: number, at: number): boolean {
  let bs = 0;
  while (at - bs - 1 >= from && text[at - bs - 1] === "\\") bs++;
  return bs % 2 === 1;
}

/** Finds the next run of exact length `size` before a blank line or EOF. In
 *  a single-dollar span an escaped `\$` is content. */
function findInlineClose(text: string, from: number, size: number): { close: number; hitBlank: boolean } {
  let j = from;
  while (j < text.length) {
    const ch = text[j];
    if (ch === "$" && size === 1 && escaped(text, from, j)) {
      j++;
      continue;
    }
    if (ch === "$") {
      const start = j;
      while (text[j] === "$") j++;
      if (j - start === size) return { close: start, hitBlank: false };
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      j += ch === "\r" && text[j + 1] === "\n" ? 2 : 1;
      let k = j;
      while (k < text.length && (text[k] === " " || text[k] === "\t")) k++;
      if (k < text.length && (text[k] === "\n" || text[k] === "\r")) {
        return { close: -1, hitBlank: true };
      }
      continue;
    }
    j++;
  }
  return { close: -1, hitBlank: false };
}

/** Finds a closing `mathFlow` fence line with at least `openSize` dollars. */
function findFenceClose(text: string, from: number, openSize: number): { lineStart: number; lineEnd: number } | null {
  let pos = from;
  while (pos < text.length) {
    let lineEnd = pos;
    while (lineEnd < text.length && text[lineEnd] !== "\n" && text[lineEnd] !== "\r") lineEnd++;
    let j = pos;
    while (j < lineEnd && (text[j] === " " || text[j] === "\t")) j++;
    let run = 0;
    while (j + run < lineEnd && text[j + run] === "$") run++;
    if (run >= openSize) {
      let k = j + run;
      while (k < lineEnd && (text[k] === " " || text[k] === "\t")) k++;
      if (k === lineEnd) return { lineStart: pos, lineEnd };
    }
    if (lineEnd === text.length) break;
    pos = text[lineEnd] === "\r" && text[lineEnd + 1] === "\n" ? lineEnd + 2 : lineEnd + 1;
  }
  return null;
}

function stripTrailingEol(s: string): string {
  if (s.endsWith("\r\n")) return s.slice(0, -2);
  if (s.endsWith("\n") || s.endsWith("\r")) return s.slice(0, -1);
  return s;
}

function stripIndent(body: string, indent: number): string {
  if (!indent || !body) return body;
  const parts = body.split(/(\r\n|\n|\r)/);
  for (let idx = 0; idx < parts.length; idx += 2) {
    const line = parts[idx];
    let cut = 0;
    while (cut < indent && cut < line.length && (line[cut] === " " || line[cut] === "\t")) cut++;
    parts[idx] = line.slice(cut);
  }
  return parts.join("");
}

/** Strips one paired outer space/newline when content has non-space data,
 *  matching micromark-extension-math's `resolveMathText`. */
function stripPadding(raw: string): string {
  if (!/[^ \r\n]/.test(raw)) return raw;
  const lead = raw.startsWith("\r\n") ? 2 : raw[0] === " " || raw[0] === "\n" || raw[0] === "\r" ? 1 : 0;
  if (!lead) return raw;
  const tail = raw.endsWith("\r\n") ? 2 : raw[raw.length - 1] === " " || raw[raw.length - 1] === "\n" || raw[raw.length - 1] === "\r" ? 1 : 0;
  if (!tail || lead + tail > raw.length) return raw;
  return raw.slice(lead, raw.length - tail);
}

