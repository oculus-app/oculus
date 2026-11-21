import { mathsReady, renderToString } from "@/lib/maths";

/** A run of block text: plain, or a formula. */
export type Piece = { text: string } | { tex: string; display: boolean };

/**
 * Splits text on `$$…$$` and `$…$` with remark-math's delimiter rules: any
 * run of `$` closes on the next run of the exact same length, spaces inside
 * `$…$` and trailing digits (`$x$2`) are allowed, paired single outer spaces
 * are stripped, and `\$` outside maths is a literal dollar. `open` is the
 * earliest unclosed delimiter (-1 when none).
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
    let size = 0;
    while (text[i + size] === "$") size++;
    const start = i + size;
    const end = closingRun(text, start, size);
    if (end < 0) {
      if (open < 0) open = i;
      plain += text.slice(i, start);
      i = start;
      continue;
    }
    if (plain) pieces.push({ text: plain });
    plain = "";
    pieces.push({ tex: stripPadding(text.slice(start, end)), display: size >= 2 });
    i = end + size;
  }
  if (plain) pieces.push({ text: plain });
  return { pieces, open };
}

/** Finds the next run of exactly `size` consecutive `$` characters from `from`. */
function closingRun(text: string, from: number, size: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === "$") {
      const start = i;
      while (text[i] === "$") i++;
      if (i - start === size) return start;
    } else {
      i++;
    }
  }
  return -1;
}

/** Strips one paired outer space/newline when content has non-space data,
 *  matching micromark-extension-math's `resolveMathText`. */
function stripPadding(raw: string): string {
  if (
    raw.length >= 2 &&
    (raw[0] === " " || raw[0] === "\n" || raw[0] === "\r") &&
    (raw[raw.length - 1] === " " || raw[raw.length - 1] === "\n" || raw[raw.length - 1] === "\r") &&
    /[^ \r\n]/.test(raw)
  ) {
    return raw.slice(1, -1);
  }
  return raw;
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

/** Replaces a text node holding maths with its text and formulas, first
 *  joining adjacent text siblings (e.g. split around `<` or `&lt;`). */
export function mathify(node: Text) {
  if (!node.parentNode) return;
  while (node.nextSibling?.nodeType === Node.TEXT_NODE) {
    node.data += (node.nextSibling as Text).data;
    node.nextSibling.remove();
  }
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
