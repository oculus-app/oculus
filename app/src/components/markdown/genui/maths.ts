import { mathsReady, renderToString } from "@/lib/maths";

/** A run of block text: plain, or a formula. */
export type Piece = { text: string } | { tex: string; display: boolean };

/**
 * Splits text on `$$…$$` and `$…$` as remark-math reads a paragraph: an
 * inline formula opens on a `$` not followed by a space and closes on one not
 * preceded by a space nor followed by a digit; `\$` is a dollar. `open` is
 * where an unclosed formula starts (-1 when none), so a streaming tail can
 * hold it back instead of showing half its TeX.
 */
export function splitMaths(text: string): { pieces: Piece[]; open: number } {
  const pieces: Piece[] = [];
  let plain = "";
  let i = 0;
  let open = -1;
  while (i < text.length) {
    const c = text[i];
    if (c === "\\" && text[i + 1] === "$") {
      plain += "$";
      i += 2;
      continue;
    }
    if (c !== "$") {
      plain += c;
      i++;
      continue;
    }
    const display = text[i + 1] === "$";
    const start = i + (display ? 2 : 1);
    const end = display ? text.indexOf("$$", start) : closingDollar(text, start);
    if (!display && start < text.length && /\s/.test(text[start])) {
      plain += c;
      i++;
      continue;
    }
    if (end < 0) {
      open = i;
      plain += text.slice(i);
      break;
    }
    if (plain) pieces.push({ text: plain });
    plain = "";
    pieces.push({ tex: text.slice(start, end), display });
    i = end + (display ? 2 : 1);
  }
  if (plain) pieces.push({ text: plain });
  return { pieces, open };
}

/** A `$` inside braces is TeX's own (`\colorbox{…}{$x$}`), never the close. */
function closingDollar(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth = Math.max(0, depth - 1);
    else if (depth === 0 && text[i] === "$" && !/\s/.test(text[i - 1]) && !/\d/.test(text[i + 1] ?? "")) return i;
  }
  return -1;
}

// Parsed renders by mode and source; a hit is cloned, never re-parsed.
const parsed = new Map<string, DocumentFragment>();

/** A formula as the reply's paragraphs draw it (`rehypeMaths`): strict first,
 *  then KaTeX's lenient error span. Wrapped in a span that names its TeX, so
 *  the morph keeps a formula that didn't change without walking it. */
export function formula(tex: string, display: boolean): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = display ? "genui-math genui-math-display" : "genui-math";
  wrap.setAttribute("data-tex", (display ? "D" : "I") + tex);
  if (!mathsReady()) {
    wrap.classList.add("md-math-pending");
    wrap.textContent = tex;
    return wrap;
  }
  const key = (display ? "D" : "I") + tex;
  let frag = parsed.get(key);
  if (!frag) {
    let html: string | null = null;
    let error: string | null = null;
    try {
      html = renderToString(tex, { displayMode: display, sourceMap: true, throwOnError: true });
    } catch {
      try {
        html = renderToString(tex, { displayMode: display, sourceMap: true, strict: "ignore", throwOnError: false });
      } catch (e) {
        error = String(e);
      }
    }
    const t = document.createElement("template");
    if (html != null) {
      t.innerHTML = html;
    } else {
      const span = document.createElement("span");
      span.className = "katex-error";
      span.setAttribute("title", error ?? "");
      span.textContent = tex;
      t.content.appendChild(span);
    }
    frag = t.content;
    if (parsed.size > 2000) parsed.delete(parsed.keys().next().value!);
    parsed.set(key, frag);
  }
  wrap.appendChild(frag.cloneNode(true));
  return wrap;
}

/** Replaces a text node holding maths with its text and formulas. */
export function mathify(node: Text) {
  const value = node.data;
  if (!value.includes("$")) return;
  const { pieces } = splitMaths(value);
  if (pieces.length === 1 && "text" in pieces[0]) {
    if (pieces[0].text !== value) node.data = pieces[0].text;
    return;
  }
  const out = pieces.map((p) => ("text" in p ? document.createTextNode(p.text) : formula(p.tex, p.display)));
  node.replaceWith(...out);
}
