import { splitLibraryPaths } from "@/lib/files/libraryPaths";
import { parseLink } from "@/lib/harness/links";
import { skillText, splitSkillTokens } from "@/lib/harness/skills";
import { chipText, linkChunks, ZWSP, ZWSP_RE, type Chunk } from "./chunks";

/** Selector matching every atomic composer chip element. */
const CHIP_SELECTOR = "[data-path], [data-attachment], [data-skill]";

/** Block tags a paste or undo may split the box into; each means a line break. */
const BLOCKS = new Set(["DIV", "P", "LI"]);

export type Point = { node: Node; offset: number };

/** `stale`: a drawn link no longer reads as one, so the nodes need redrawing. */
export type Reading = { text: string; caret: number | null; chunks: Chunk[]; stale: boolean };

/** A mention, an attachment or a picked skill, the atomic references: the
 *  caret steps over each whole and a delete key takes it whole. */
export function isChip(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  return el.hasAttribute("data-path") || el.hasAttribute("data-attachment") || el.hasAttribute("data-skill");
}

/** The atomic chip enclosing `node` (or `node` itself) inside `root`, if any. */
export function enclosingChip(root: HTMLElement, node: Node | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (isChip(cur)) return cur as HTMLElement;
    cur = cur.parentNode;
  }
  return null;
}

/** Which editable edge of `chip` is closer to a pointer click at `(clientX, clientY)`. */
export function chipSideForPoint(chip: HTMLElement, clientX: number, clientY: number): "before" | "after" {
  const rects = Array.from(chip.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
  const hit = rects.find((r) => clientY >= r.top && clientY <= r.bottom) ?? chip.getBoundingClientRect();
  return clientX < (hit.left + hit.right) / 2 ? "before" : "after";
}

/** True when `node` contains no visible content (only empty/ZWSP text or empty wrappers). */
function hasMeaningfulContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return (node as Text).data.replace(ZWSP_RE, "") !== "";
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as HTMLElement;
  if (el.tagName === "BR" || isChip(el) || isLink(el)) return true;
  for (let c = el.firstChild; c; c = c.nextSibling) {
    if (hasMeaningfulContent(c)) return true;
  }
  return false;
}

/** True when no meaningful content follows `node` anywhere inside `root`. */
function isTrailingSentinelBr(root: HTMLElement, node: Node): boolean {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    for (let sib = cur.nextSibling; sib; sib = sib.nextSibling) {
      if (hasMeaningfulContent(sib)) return false;
    }
    cur = cur.parentNode;
  }
  return true;
}

/** A link (`ComposerLink`): editable text drawn as a link. */
function isLink(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).hasAttribute("data-link");
}

/** A markdown link's words back into `[words](href)`; a bare link is its text. */
function linkRaw(text: string, href: string | null): string {
  if (href == null) return text;
  return text ? `[${text}](${href})` : "";
}

/** Walks the nodes into the sent text, its chunks and the caret's offset in one
 *  pass, because the `@` token is found by offset and spliced by chunk. Drops
 *  WebKit's no-break space (its stand-in for a trailing typed space) and ZWSP. */
export function readEditor(root: HTMLElement, point: Point | null, placeholderNl?: Text | null): Reading {
  const chunks: Chunk[] = [];
  let text = "";
  let caret: number | null = null;
  let stale = false;

  const push = (s: string) => {
    if (!s) return;
    const last = chunks[chunks.length - 1];
    if (last?.kind === "text") last.text += s;
    else chunks.push({ kind: "text", text: s });
    text += s;
  };
  const clean = (s: string) => s.replace(/ /g, " ").replace(ZWSP_RE, "");

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      let raw = (node as Text).data;
      if (placeholderNl && node === placeholderNl && raw.endsWith("\n") && isTrailingSentinelBr(root, node)) {
        raw = raw.slice(0, -1);
      }
      if (point?.node === node) {
        const at = Math.min(point.offset, raw.length);
        push(clean(raw.slice(0, at)));
        caret = text.length;
        push(clean(raw.slice(at)));
      } else {
        push(clean(raw));
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (isLink(el)) {
      visitLink(el);
      return;
    }
    if (el.hasAttribute("data-skill")) {
      const name = el.getAttribute("data-skill") ?? "";
      chunks.push({ kind: "skill", name });
      text += skillText(name);
      if (point && el.contains(point.node)) caret = text.length;
      return;
    }
    if (el.hasAttribute("data-attachment")) {
      const path = el.getAttribute("data-attachment") ?? "";
      chunks.push({ kind: "attachment", path });
      text += chipText(path);
      if (point && el.contains(point.node)) caret = text.length;
      return;
    }
    if (isChip(el)) {
      const path = el.getAttribute("data-path") ?? "";
      chunks.push({ kind: "chip", path });
      text += chipText(path);
      if (point && el.contains(point.node)) caret = text.length;
      return;
    }
    if (el.tagName === "BR") {
      if (!isTrailingSentinelBr(root, el)) push("\n");
      return;
    }
    if (BLOCKS.has(el.tagName) && text && !text.endsWith("\n")) push("\n");
    walk(el);
  };

  // The text as it stands, so an edit inside the link is read; one that leaves
  // no link reads as prose and marks the reading `stale`.
  const visitLink = (el: HTMLElement) => {
    let words = "";
    let inside: number | null = null;
    const nodes = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = nodes.nextNode() as Text | null; t; t = nodes.nextNode() as Text | null) {
      if (point?.node === t) inside = words.length + clean(t.data.slice(0, point.offset)).length;
      words += clean(t.data);
    }
    if (point?.node === el) inside = point.offset === 0 ? 0 : words.length;
    const href = el.getAttribute("data-href");
    const raw = linkRaw(words, href);
    const at = text.length;
    if (parseLink(raw)) {
      chunks.push({ kind: "link", raw });
      text += raw;
    } else {
      push(raw);
      stale = true;
    }
    if (inside != null) caret = at + (href != null && raw ? inside + 1 : inside);
  };

  const walk = (el: Node) => {
    const kids = el.childNodes;
    for (let i = 0; i < kids.length; i++) {
      if (point?.node === el && point.offset === i) caret = text.length;
      visit(kids[i]);
    }
    if (point?.node === el && point.offset === kids.length) caret = text.length;
  };

  walk(root);
  return { text, caret, chunks, stale };
}

/** Reads both endpoints of the live DOM selection as message offsets inside `root`. */
export function readSelection(root: HTMLElement): { anchor: number; focus: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null;
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const focus = readEditor(root, { node: sel.focusNode, offset: sel.focusOffset }).caret;
  if (focus == null) return null;
  if (sel.isCollapsed) return { anchor: focus, focus };
  const anchor = readEditor(root, { node: sel.anchorNode, offset: sel.anchorOffset }).caret;
  return { anchor: anchor ?? focus, focus };
}

/** Ordinal index of `chip` among all atomic chips inside `root` (-1 if absent). */
export function chipOrdinal(root: HTMLElement, chip: HTMLElement): number {
  const chips = Array.from(root.querySelectorAll<HTMLElement>(CHIP_SELECTOR));
  return chips.indexOf(chip);
}


/** Text back into chunks via `splitLibraryPaths`, so a restored draft chips the
 *  same runs a sent message does, and its links draw as links. An attachment
 *  keeps the message's spelling of its path. A `/name` word becomes a skill
 *  chip only when `skills` (the installed catalogue) holds it. */
export function toChunks(text: string, skills?: ReadonlySet<string>): Chunk[] {
  const paths = splitLibraryPaths(text).flatMap((p): Chunk[] => {
    if (p.kind === "path") return [{ kind: "chip", path: p.path }];
    if (p.kind === "image" || p.kind === "attachment") return [{ kind: "attachment", path: p.raw }];
    if (!skills?.size) return [{ kind: "text", text: p.text }];
    return splitSkillTokens(p.text, skills);
  });
  return linkChunks(paths);
}

/** True when nothing but WebKit's placeholder `<br>` follows the caret — the one
 *  place it can't be measured (see `revealCaret`). */
function atEnd(el: HTMLElement, caret: Range): boolean {
  const tail = document.createRange();
  tail.selectNodeContents(el);
  tail.setStart(caret.startContainer, caret.startOffset);
  if (tail.toString().replace(ZWSP_RE, "").replace(/\n/g, "").trim()) return false;
  const rest = tail.cloneContents();
  if (rest.querySelector("[data-path], [data-attachment], [data-skill], [data-link]")) return false;
  // One break is the placeholder; more are blank lines below the caret.
  return rest.querySelectorAll("br").length + (tail.toString().match(/\n/g)?.length ?? 0) <= 1;
}

/** The rect of a node's first or last line (wrapped text has one per line). */
function edgeRect(node: Node, side: "start" | "end"): DOMRect | null {
  let rects: DOMRectList;
  if (node.nodeType === Node.ELEMENT_NODE) {
    rects = (node as HTMLElement).getClientRects();
  } else {
    const range = document.createRange();
    range.selectNodeContents(node);
    rects = range.getClientRects();
  }
  const rect = side === "end" ? rects[rects.length - 1] : rects[0];
  return rect && rect.height ? rect : null;
}

/** The caret's line. WebKit gives no rects for a caret between nodes (where a
 *  line break leaves it), so the neighbours are measured — never the box itself,
 *  which is the viewport the caret is compared against. */
function caretRect(caret: Range): DOMRect | null {
  const own = caret.getClientRects()[0];
  if (own?.height) return own;
  const node = caret.startContainer;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const before = node.childNodes[caret.startOffset - 1];
  const after = node.childNodes[caret.startOffset];
  return (before && edgeRect(before, "end")) || (after && edgeRect(after, "start")) || null;
}

/** Scroll the box so the caret is in view: WebKit doesn't follow an `execCommand`
 *  break past `max-h`, and a hand-placed range moves no scroll. At the end, the
 *  placeholder `<br>` measures inconsistently, so jump to the bottom instead.
 *  Not `scrollIntoView` — that would scroll the thread behind the composer too. */
export function revealCaret(el: HTMLElement) {
  // A box written to while unfocused (a `clear()`) keeps its scroll.
  if (!el.contains(document.activeElement)) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.focusNode || !el.contains(sel.focusNode)) return;
  const caret = sel.getRangeAt(0).cloneRange();
  caret.collapse(false);
  if (atEnd(el, caret)) {
    el.scrollTop = el.scrollHeight;
    return;
  }
  const rect = caretRect(caret);
  if (!rect) return;
  const view = el.getBoundingClientRect();
  if (rect.bottom > view.bottom) el.scrollTop += rect.bottom - view.bottom;
  else if (rect.top < view.top) el.scrollTop -= view.top - rect.top;
}

/** Sets the selection again once the frame has settled. Two line breaks in
 *  quick succession can leave the first caret painted beside the second;
 *  WebKit repaints the caret when the selection is set. */
export function repaintCaret(el: HTMLElement): number {
  return requestAnimationFrame(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.focusNode || !el.contains(sel.focusNode)) return;
    const range = sel.getRangeAt(0).cloneRange();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

function childIndex(node: Node): number {
  const parent = node.parentNode;
  if (!parent) return -1;
  return Array.prototype.indexOf.call(parent.childNodes, node);
}

function setCollapsedCaret(sel: Selection, node: Node, offset: number) {
  const range = document.createRange();
  const max = node.nodeType === Node.TEXT_NODE ? (node as Text).data.length : node.childNodes.length;
  range.setStart(node, Math.max(0, Math.min(offset, max)));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Collect every editable Text node under `root` (skipping text inside chips). */
function editableTextNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || isChip(node)) return;
    for (let c = node.firstChild; c; c = c.nextSibling) visit(c);
  };
  visit(root);
  return out;
}

/** True when `(node, offset)` sits at the very start of `chip`. */
function atChipStart(chip: HTMLElement, node: Node, offset: number): boolean {
  if (offset !== 0) return false;
  let cur: Node | null = node;
  while (cur && cur !== chip) {
    if (cur.previousSibling) return false;
    cur = cur.parentNode;
  }
  return true;
}

/** Keeps the live DOM invariant around every `contenteditable="false"` chip so
 *  WebKit always has an editable text node to paint the caret in, without
 *  remounting React or leaving stray ZWSPs inside typed text. */
export function ensureChipGuards(el: HTMLElement, options?: { side?: "before" | "after" }) {
  const sel = window.getSelection();
  const inBox = sel != null && sel.rangeCount > 0 && sel.focusNode != null && el.contains(sel.focusNode);
  // Never disturb an active range selection (Shift+Arrow or pointer drag).
  if (inBox && !sel.isCollapsed) return;

  let caretNode: Node | null = inBox ? sel.focusNode : null;
  let caretOffset = inBox ? sel.focusOffset : 0;
  let selectionDirty = false;

  // 0. Never allow a collapsed caret to stay trapped inside a `contenteditable="false"` chip.
  if (caretNode) {
    const inside = enclosingChip(el, caretNode);
    if (inside && inside.parentNode) {
      const side = options?.side ?? (atChipStart(inside, caretNode, caretOffset) ? "before" : "after");
      const idx = childIndex(inside);
      caretNode = inside.parentNode;
      caretOffset = side === "after" ? idx + 1 : idx;
      selectionDirty = true;
    }
  }

  // 1. Merge adjacent editable Text nodes so deleting a middle chip never
  //    leaves two back-to-back ZWSP guards.
  const mergeAdjacentText = (parent: Node) => {
    for (let node = parent.firstChild; node; ) {
      const next = node.nextSibling;
      if (node.nodeType === Node.TEXT_NODE && next && next.nodeType === Node.TEXT_NODE) {
        const prevLen = (node as Text).data.length;
        const nextIdx = childIndex(next);
        (node as Text).data += (next as Text).data;
        if (caretNode === next) {
          caretNode = node;
          caretOffset = prevLen + caretOffset;
          selectionDirty = true;
        } else if (caretNode === parent && caretOffset > nextIdx) {
          caretOffset -= 1;
          selectionDirty = true;
        }
        parent.removeChild(next);
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE && !isChip(node)) mergeAdjacentText(node);
      node = next;
    }
  };
  mergeAdjacentText(el);

  // 2. Strip redundant ZWSPs when real text is typed into a guard, collapse
  //    multi-ZWSP guards, and drop stray ZWSP-only nodes no longer beside a chip.
  for (const t of editableTextNodes(el)) {
    if (!t.data.includes(ZWSP)) continue;
    const stripped = t.data.replace(ZWSP_RE, "");
    const besideChip = (t.previousSibling != null && isChip(t.previousSibling)) || (t.nextSibling != null && isChip(t.nextSibling));
    if (stripped.length > 0) {
      if (caretNode === t) {
        caretOffset = t.data.slice(0, caretOffset).replace(ZWSP_RE, "").length;
        selectionDirty = true;
      }
      t.data = stripped;
    } else if (besideChip) {
      if (t.data !== ZWSP) {
        t.data = ZWSP;
        if (caretNode === t) {
          caretOffset = 1;
          selectionDirty = true;
        }
      }
    } else {
      const parent = t.parentNode;
      if (parent) {
        const idx = childIndex(t);
        const nextSib = t.nextSibling;
        const prevSib = t.previousSibling;
        if (caretNode === t) {
          if (nextSib && nextSib.nodeType === Node.TEXT_NODE) {
            caretNode = nextSib;
            caretOffset = (nextSib as Text).data === ZWSP ? 1 : 0;
          } else if (prevSib && prevSib.nodeType === Node.TEXT_NODE) {
            caretNode = prevSib;
            caretOffset = (prevSib as Text).data.length;
          } else {
            caretNode = parent;
            caretOffset = idx;
          }
          selectionDirty = true;
        } else if (caretNode === parent && caretOffset > idx) {
          caretOffset -= 1;
          selectionDirty = true;
        }
        parent.removeChild(t);
      }
    }
  }

  // 3. Ensure every atomic chip has a non-empty Text node immediately before
  //    and immediately after it.
  const chips = Array.from(el.querySelectorAll<HTMLElement>(CHIP_SELECTOR));
  for (const chip of chips) {
    const parent = chip.parentNode;
    if (!parent) continue;

    const prev = chip.previousSibling;
    if (!prev || prev.nodeType !== Node.TEXT_NODE || (prev as Text).data === "") {
      const idx = childIndex(chip);
      if (prev && prev.nodeType === Node.TEXT_NODE) {
        (prev as Text).data = ZWSP;
        if (caretNode === prev || (caretNode === parent && caretOffset === idx)) {
          caretNode = prev;
          caretOffset = 1;
          selectionDirty = true;
        }
      } else {
        const guard = document.createTextNode(ZWSP);
        parent.insertBefore(guard, chip);
        if (caretNode === parent && caretOffset === idx) {
          caretNode = guard;
          caretOffset = 1;
          selectionDirty = true;
        } else if (caretNode === parent && caretOffset > idx) {
          caretOffset += 1;
          selectionDirty = true;
        }
      }
    }

    const next = chip.nextSibling;
    if (!next || next.nodeType !== Node.TEXT_NODE || (next as Text).data === "") {
      const idx = childIndex(chip);
      if (next && next.nodeType === Node.TEXT_NODE) {
        (next as Text).data = ZWSP;
        if (caretNode === next || (caretNode === parent && caretOffset === idx + 1)) {
          caretNode = next;
          caretOffset = 1;
          selectionDirty = true;
        }
      } else {
        const guard = document.createTextNode(ZWSP);
        parent.insertBefore(guard, next);
        if (caretNode === parent && caretOffset === idx + 1) {
          caretNode = guard;
          caretOffset = 1;
          selectionDirty = true;
        } else if (caretNode === parent && caretOffset > idx + 1) {
          caretOffset += 1;
          selectionDirty = true;
        }
      }
    }
  }

  // 4. Snap a collapsed caret off element boundaries and past offset 0 of a
  //    bare ZWSP guard so WebKit always has a concrete caret rect.
  if (caretNode) {
    if (caretNode.nodeType === Node.TEXT_NODE && (caretNode as Text).data === ZWSP && caretOffset === 0) {
      caretOffset = 1;
      selectionDirty = true;
    } else if (caretNode.nodeType === Node.ELEMENT_NODE) {
      const kids = caretNode.childNodes;
      const before = caretOffset > 0 ? kids[caretOffset - 1] : null;
      const after = caretOffset < kids.length ? kids[caretOffset] : null;
      if (before && before.nodeType === Node.TEXT_NODE && (before as Text).data === ZWSP) {
        caretNode = before;
        caretOffset = 1;
        selectionDirty = true;
      } else if (before && isChip(before) && after && after.nodeType === Node.TEXT_NODE) {
        caretNode = after;
        caretOffset = (after as Text).data === ZWSP ? 1 : 0;
        selectionDirty = true;
      } else if (after && isChip(after) && before && before.nodeType === Node.TEXT_NODE) {
        caretNode = before;
        caretOffset = (before as Text).data.length;
        selectionDirty = true;
      } else if (after && after.nodeType === Node.TEXT_NODE) {
        caretNode = after;
        caretOffset = (after as Text).data === ZWSP ? 1 : 0;
        selectionDirty = true;
      } else if (before && before.nodeType === Node.TEXT_NODE) {
        caretNode = before;
        caretOffset = (before as Text).data.length;
        selectionDirty = true;
      } else if (after && isLink(after) && after.firstChild?.nodeType === Node.TEXT_NODE) {
        caretNode = after.firstChild;
        caretOffset = 0;
        selectionDirty = true;
      } else if (before && isLink(before) && before.lastChild?.nodeType === Node.TEXT_NODE) {
        caretNode = before.lastChild;
        caretOffset = (before.lastChild as Text).data.length;
        selectionDirty = true;
      }
    }
  }

  if (selectionDirty && sel && caretNode) setCollapsedCaret(sel, caretNode, caretOffset);
}

/** Steps a collapsed caret cleanly across `chip` in one keypress, landing in
 *  the flanking text node so there are no dead ZWSP stops. */
export function moveCaretPastChip(el: HTMLElement, chip: HTMLElement, side: "before" | "after") {
  ensureChipGuards(el);
  const sel = window.getSelection();
  if (!sel) return;
  const sibling = side === "before" ? chip.previousSibling : chip.nextSibling;
  if (sibling && sibling.nodeType === Node.TEXT_NODE) {
    const data = (sibling as Text).data;
    const offset = side === "before" ? data.length : data === ZWSP ? 1 : 0;
    setCollapsedCaret(sel, sibling, offset);
  }
}

/** Fallback for WebKit vertical arrow stalls around wrapped `contenteditable="false"`
 *  chips: when `ArrowDown`/`ArrowUp` left the collapsed selection unchanged even
 *  though content exists on another visual line, step past the blocking chip or
 *  onto the adjacent line's editable text. */
export function stepVerticallyPastChip(el: HTMLElement, dir: "up" | "down"): boolean {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.focusNode || !el.contains(sel.focusNode)) return false;
  ensureChipGuards(el);
  const range = sel.getRangeAt(0).cloneRange();
  const curRect = caretRect(range);
  const chips = Array.from(el.querySelectorAll<HTMLElement>(CHIP_SELECTOR));
  if (!chips.length) return false;

  if (dir === "down") {
    for (const chip of chips) {
      const chipRange = document.createRange();
      chipRange.selectNode(chip);
      if (range.compareBoundaryPoints(Range.START_TO_START, chipRange) <= 0) {
        const after = chip.nextSibling;
        if (after && after.nodeType === Node.TEXT_NODE) {
          const data = (after as Text).data;
          const chipRect = chip.getBoundingClientRect();
          if (!curRect || chipRect.bottom > curRect.bottom - 1 || chipRect.top > curRect.top + 1) {
            setCollapsedCaret(sel, after, data === ZWSP ? 1 : 0);
            return true;
          }
        }
      }
    }
    const last = el.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) {
      const lastRect = edgeRect(last, "end");
      if (curRect && lastRect && lastRect.top > curRect.top + 1) {
        setCollapsedCaret(sel, last, (last as Text).data.length);
        return true;
      }
    }
  } else {
    for (let i = chips.length - 1; i >= 0; i--) {
      const chip = chips[i];
      const chipRange = document.createRange();
      chipRange.selectNode(chip);
      if (range.compareBoundaryPoints(Range.END_TO_END, chipRange) >= 0) {
        const before = chip.previousSibling;
        if (before && before.nodeType === Node.TEXT_NODE) {
          const chipRect = chip.getBoundingClientRect();
          if (!curRect || chipRect.top < curRect.top + 1 || chipRect.bottom < curRect.bottom - 1) {
            setCollapsedCaret(sel, before, (before as Text).data.length);
            return true;
          }
        }
      }
    }
    const first = el.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE) {
      const firstRect = edgeRect(first, "start");
      if (curRect && firstRect && firstRect.bottom < curRect.top + 1) {
        setCollapsedCaret(sel, first, (first as Text).data === ZWSP ? 1 : 0);
        return true;
      }
    }
  }
  return false;
}

/** Focuses `el` and places a visible caret at its end, inside the last text
 *  node when one exists (WebKit paints no caret at `(el, end)` after a chip). */
export function placeCaretAtEnd(el: HTMLElement) {
  el.focus();
  ensureChipGuards(el);
  const sel = window.getSelection();
  if (!sel) return;
  if (el.childNodes.length === 1 && el.firstChild?.nodeName === "BR") {
    setCollapsedCaret(sel, el, 0);
    return;
  }
  const last = el.lastChild;
  if (last?.nodeType === Node.TEXT_NODE) {
    setCollapsedCaret(sel, last, (last as Text).data.length);
    return;
  }
  if (last?.nodeType === Node.ELEMENT_NODE && isLink(last) && last.lastChild?.nodeType === Node.TEXT_NODE) {
    const text = last.lastChild as Text;
    setCollapsedCaret(sel, text, text.data.length);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}
