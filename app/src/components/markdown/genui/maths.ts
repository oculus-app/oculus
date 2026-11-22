import { mathsReady, renderToString } from "@/lib/maths";
import { type Piece, scanMaths } from "@/lib/markdown/mathScan";

/** Splits text on display and inline maths, matching the reply's remark-math pipeline. */
export function splitMaths(text: string): { pieces: Piece[]; open: number } {
  const { pieces, open } = scanMaths(text);
  return { pieces, open };
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
