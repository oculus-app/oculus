import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import { AttachmentChip } from "@/components/markdown/AttachmentChip";
import { CheckedFileChip } from "@/components/markdown/CheckedFileChip";
import { attachableFiles } from "@/lib/harness/attachments";
import { hasControlChars } from "@/lib/harness/controlChars";
import { onEdit as registerEditHandler } from "@/lib/menu/editRouting";
import { isMac } from "@/lib/platform";
import {
  caretChunk,
  chunkText,
  chunksText,
  domOffset,
  dropAttachment,
  dropSkill,
  equalChunks,
  insertAt,
  linkChunks,
  maskedText,
  normalize,
  pasteAt,
  removeChipByOrdinal,
  sameChunks,
  ZWSP,
  ZWSP_RE,
  type Chunk,
  type LinkScan,
} from "./chunks";
import {
  chipOrdinal,
  chipSideForPoint,
  enclosingChip,
  ensureChipGuards,
  isChip,
  moveCaretPastChip,
  placeCaretAtEnd,
  readEditor,
  readSelection,
  repaintCaret,
  revealCaret,
  stepVerticallyPastChip,
  toChunks,
  type Point,
} from "./dom";
import { copiedChunks, copySelection } from "./clipboard";
import { ComposerLink } from "./ComposerLink";
import { SkillChip } from "./SkillChip";
import { cn } from "@/lib/utils";
import type { Landing, MentionInputHandle } from "./types";

export type { MentionInputHandle } from "./types";

type HistoryEntry = { chunks: Chunk[]; caret: number };
const HISTORY_LIMIT = 100;
const TYPE_COALESCE_MS = 600;

const nonTextCount = (list: Chunk[]) => list.reduce((n, c) => n + (c.kind === "text" ? 0 : 1), 0);

/** A text run as WebKit would have typed it: a space ending the box is a
 *  no-break space. Drawn as a plain space after a wrapped link, the next
 *  keystroke lands inside the link and the space is lost. `readEditor` reads
 *  it back as a space. */
const drawnText = (text: string, last: boolean) => (last && text.endsWith(" ") ? `${text.slice(0, -1)}\u00a0` : text);

/** Nothing typed: a space counts as text, so the placeholder gives way to it.
 *  Line breaks don't, as WebKit's trailing `<br>` reads as one. */
const isBlank = (text: string) => text.replace(/[\r\n]/g, "") === "";

/**
 * A contenteditable whose `@` mentions, attachments and picked skills are
 * inline `contenteditable="false"` references and whose web links are text
 * drawn as links (`ComposerLink`). Drawn and sent text differ: `readEditor`
 * turns each mention back into its backticked library path and each
 * attachment into its backticked `./attachments/…` path, so the agent never
 * sees a display name, each skill into `/name`, and each link into the text as
 * written. A link is drawn when pasted, or when the space after it is typed,
 * and stops being one when an edit leaves no link. Only Shift+Enter and
 * chip-eating Backspace/Delete are intercepted. Copy and cut write the
 * selection as sent text and as chunks (`clipboard.ts`), so a paste back
 * keeps its chips.
 */
export function MentionInput({
  ref,
  placeholder,
  initialText,
  skills,
  autoFocus,
  onEdit,
  onFiles,
  onPasteText,
  onKeyDown,
  onBlur,
  oneLinePlaceholder = false,
}: {
  ref?: Ref<MentionInputHandle>;
  placeholder: string;
  /** The hint stays on one line, cut with an ellipsis (a compact composer at rest). */
  oneLinePlaceholder?: boolean;
  /** Read once at mount; after that the DOM is the truth. */
  initialText?: string;
  /** The installed skills' names: a `/name` in loaded text becomes a chip only
   *  if it is here. Null while the catalogue loads; once it lands, a box not
   *  yet edited draws its chips. */
  skills?: ReadonlySet<string> | null;
  autoFocus?: boolean;
  /** `masked` is `text` with each picked skill's characters masked, for
   *  finding a `/` trigger without matching a chip. */
  onEdit: (text: string, caret: number, masked: string, skills: string[]) => void;
  /** Pasted pictures, PDFs and text files; the caller writes them and puts
   *  their chips back through `insertAttachments`. */
  onFiles?: (files: File[]) => void;
  /** Offered a plain-text paste first; true means it was taken (as a card). */
  onPasteText?: (text: string) => boolean;
  /** Runs first; anything not `preventDefault`ed falls through to the editing keys. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onBlur?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [chunks, setChunks] = useState<Chunk[]>(() => normalize(toChunks(initialText ?? "", skills ?? undefined)));
  /** The editor's `key`: a structural change remounts instead of diffing a tree
   *  the typist edited underneath React. */
  const [version, setVersion] = useState(0);
  /** Placeholder flag — `:empty` can't do it, WebKit's trailing `<br>` isn't empty. */
  const [blank, setBlank] = useState(isBlank(initialText ?? ""));
  const landing = useRef<Landing | null>(null);
  /** Whether anything has changed the text since mount; a late catalogue only
   *  redraws a box that still holds what it loaded. */
  const touched = useRef(false);
  /** The pending `repaintCaret`; one is enough for a burst of line breaks. */
  const repaint = useRef(0);
  const arrowFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const guardingInsert = useRef(false);
  const placeholderNl = useRef<Text | null>(null);
  const lastPointer = useRef<{ x: number; y: number; at: number } | null>(null);
  const history = useRef<{
    past: HistoryEntry[];
    present: HistoryEntry;
    future: HistoryEntry[];
    lastAt: number;
    lastKind: "type" | "other";
  }>({
    past: [],
    present: { chunks, caret: chunksText(chunks).length },
    future: [],
    lastAt: 0,
    lastKind: "other",
  });
  useEffect(
    () => () => {
      cancelAnimationFrame(repaint.current);
      if (arrowFallback.current != null) clearTimeout(arrowFallback.current);
    },
    [],
  );

  function recordHistory(nextChunks: Chunk[], nextCaret: number, kind: "type" | "other", data?: string | null) {
    const h = history.current;
    const norm = normalize(nextChunks);
    if (equalChunks(norm, h.present.chunks)) {
      h.present.caret = nextCaret;
      return;
    }
    const now = Date.now();
    const canCoalesce =
      kind === "type" &&
      h.lastKind === "type" &&
      now - h.lastAt < TYPE_COALESCE_MS &&
      nonTextCount(norm) === nonTextCount(h.present.chunks) &&
      (!data || !/\s/.test(data)) &&
      Math.abs(nextCaret - h.present.caret) <= 2;
    if (canCoalesce) {
      h.present = { chunks: norm, caret: nextCaret };
      h.lastAt = now;
      h.future = [];
      return;
    }
    h.past.push(h.present);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.present = { chunks: norm, caret: nextCaret };
    h.future = [];
    h.lastAt = now;
    h.lastKind = kind;
  }

  function applyHistory(redo: boolean): boolean {
    const el = box.current;
    if (!el || !el.contains(document.activeElement)) return false;
    if (composing.current) return false;
    const h = history.current;
    const stack = redo ? h.future : h.past;
    const opposite = redo ? h.past : h.future;
    const target = stack.pop();
    if (!target) return true;
    opposite.push(h.present);
    if (opposite.length > HISTORY_LIMIT) opposite.shift();
    h.present = target;
    h.lastKind = "other";
    h.lastAt = 0;
    commit(target.chunks, target.caret, true, { history: "none" });
    return true;
  }

  const applyHistoryRef = useRef(applyHistory);
  applyHistoryRef.current = applyHistory;
  useEffect(() => registerEditHandler((redo) => applyHistoryRef.current(redo)), []);

  const beforeInputRef = useRef<(e: InputEvent) => void>(() => {});
  beforeInputRef.current = (e: InputEvent) => {
    if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
      e.preventDefault();
      applyHistory(e.inputType === "historyRedo");
      return;
    }
    if (e.inputType === "insertText" && e.data != null && hasControlChars(e.data)) {
      e.preventDefault();
      return;
    }
    if (
      e.inputType === "insertText" &&
      e.data &&
      !e.isComposing &&
      !composing.current &&
      !guardingInsert.current &&
      box.current
    ) {
      const el = box.current;
      const sel = window.getSelection();
      if (!sel || !sel.isCollapsed) return;
      const prevChip = chipBeside(el, "back");
      const nextChip = chipBeside(el, "forward");
      const needLead = prevChip?.hasAttribute("data-skill") === true && !/^\s/.test(e.data);
      const needTrail = nextChip?.hasAttribute("data-skill") === true && !/\s$/.test(e.data);
      if (!needLead && !needTrail) return;
      e.preventDefault();
      guardingInsert.current = true;
      try {
        const text = `${needLead ? " " : ""}${e.data}${needTrail ? " " : ""}`;
        document.execCommand("insertText", false, text);
        if (needTrail) {
          const cur = window.getSelection();
          if (cur && cur.isCollapsed && cur.focusNode?.nodeType === Node.TEXT_NODE && cur.focusOffset > 0) {
            const range = document.createRange();
            range.setStart(cur.focusNode, cur.focusOffset - 1);
            range.collapse(true);
            cur.removeAllRanges();
            cur.addRange(range);
            sync();
          }
        }
      } finally {
        guardingInsert.current = false;
      }
    }
  };

  // Native `beforeinput`: React's `onBeforeInput` is a `textInput` shim with no `inputType`.
  // Refuses control characters, routes undo/redo to editor history, and separates
  // non-whitespace text typed directly against a skill chip.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onBeforeInput = (e: InputEvent) => beforeInputRef.current(e);
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  }, [version]);

  const repairSelectionRef = useRef<() => void>(() => {});
  repairSelectionRef.current = () => {
    const el = box.current;
    if (!el || composing.current || !el.contains(document.activeElement)) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !sel.focusNode || !el.contains(sel.focusNode)) return;
    const node = sel.focusNode;
    const offset = sel.focusOffset;
    const inside = enclosingChip(el, node);
    const isEmptyPlaceholder =
      node === el && offset === 0 && (el.childNodes.length === 0 || (el.childNodes.length === 1 && el.firstChild?.nodeName === "BR"));
    const needsRepair =
      inside != null ||
      (node.nodeType === Node.TEXT_NODE && (node as Text).data === ZWSP && offset === 0) ||
      (node.nodeType === Node.ELEMENT_NODE && !isEmptyPlaceholder);
    if (!needsRepair) return;
    const ptr = lastPointer.current;
    const side = inside && ptr && Date.now() - ptr.at < 500 ? chipSideForPoint(inside, ptr.x, ptr.y) : undefined;
    ensureChipGuards(el, side ? { side } : undefined);
    sync();
  };

  useEffect(() => {
    const onSelectionChange = () => repairSelectionRef.current();
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  function point(el: HTMLElement): Point | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.focusNode) return null;
    if (!el.contains(sel.focusNode)) return null;
    return { node: sel.focusNode, offset: sel.focusOffset };
  }

  /** Also on arrow keys and clicks: a caret landing beside an `@` opens the menu. */
  function sync(record?: { kind: "type" | "other"; data?: string | null }) {
    const el = box.current;
    if (!el) return;
    if (!composing.current) ensureChipGuards(el);
    if (placeholderNl.current && (!el.contains(placeholderNl.current) || !placeholderNl.current.data.endsWith("\n"))) {
      placeholderNl.current = null;
    }
    const r = readEditor(el, point(el), placeholderNl.current);
    const caret = r.caret ?? r.text.length;
    if (record) recordHistory(r.chunks, caret, record.kind, record.data);
    else if (equalChunks(normalize(r.chunks), history.current.present.chunks)) history.current.present.caret = caret;
    setBlank(isBlank(r.text));
    if (r.text !== chunksText(chunks)) touched.current = true;
    onEdit(r.text, caret, maskedText(r.chunks), r.chunks.flatMap((c) => (c.kind === "skill" ? [c.name] : [])));
  }

  /** Redraws the links when an edit made or unmade one. The message text does
   *  not change, so the caret keeps its offset. `scan`: see `LinkScan`. */
  function linkify(scan: LinkScan): boolean {
    const el = box.current;
    if (!el) return false;
    const r = readEditor(el, point(el), placeholderNl.current);
    const next = linkChunks(r.chunks, scan);
    if (!r.stale && sameChunks(next, r.chunks)) return false;
    commit(next, r.caret ?? r.text.length);
    return true;
  }

  /** A typed space or line break ends the word before it. */
  function input(e: FormEvent<HTMLDivElement>) {
    const ev = e.nativeEvent as InputEvent;
    const { inputType, data } = ev;
    if (ev.isComposing || composing.current) {
      sync();
      return;
    }
    if (box.current) ensureChipGuards(box.current);
    const ends = inputType === "insertParagraph" || inputType === "insertLineBreak" || (inputType === "insertText" && data != null && /\s/.test(data));
    if (linkify(ends ? "settled" : "typed")) return;
    sync({ kind: inputType === "insertText" ? "type" : "other", data });
  }

  function commit(
    next: Chunk[],
    caret: number,
    focus?: boolean,
    opts?: { anchor?: number; history?: "push" | "replace" | "none" },
  ) {
    placeholderNl.current = null;
    const el = box.current;
    const norm = normalize(next);
    if (chunksText(norm) !== (initialText ?? "")) touched.current = true;
    const focused = el != null && el.contains(document.activeElement);
    const wantFocus = focus === true || (focus !== false && focused);
    const endSpot = caretChunk(norm, caret);
    const anchorSpot = opts?.anchor != null && opts.anchor !== caret ? caretChunk(norm, opts.anchor) : undefined;
    landing.current = {
      ...endSpot,
      anchor: anchorSpot,
      focus: wantFocus,
    };
    const mode = opts?.history ?? "push";
    if (mode === "push") recordHistory(norm, caret, "other");
    else if (mode === "replace") history.current.present = { chunks: norm, caret };
    setChunks(norm);
    setVersion((v) => v + 1);
    const text = chunksText(norm);
    setBlank(isBlank(text));
    onEdit(text, caret, maskedText(norm), norm.flatMap((c) => (c.kind === "skill" ? [c.name] : [])));
  }

  // The catalogue landed after mount: chip the loaded text's skills, unless
  // the student has already typed. Never steals focus or collapses an active selection.
  useEffect(() => {
    if (!skills?.size || touched.current || !initialText?.includes("/")) return;
    const next = normalize(toChunks(initialText, skills));
    if (sameChunks(next, chunks)) return;
    const el = box.current;
    const focused = el != null && el.contains(document.activeElement);
    const sel = focused && el ? readSelection(el) : null;
    commit(next, sel ? sel.focus : chunksText(next).length, focused, {
      anchor: sel?.anchor,
      history: "replace",
    });
    // Only a catalogue change re-runs this; the rest is read at that moment.
  }, [skills]);

  /** Swaps the token from message offset `start` to the caret for `insert`,
   *  then a space; the caret lands after the space. A token never holds a
   *  backtick, newline or chip, so it is in one text run. */
  function splice(start: number, insert: Chunk[]) {
    const el = box.current;
    if (!el) return;
    const r = readEditor(el, point(el));
    const caret = r.caret ?? r.text.length;
    let at = 0;
    for (let i = 0; i < r.chunks.length; i++) {
      const c = r.chunks[i];
      const len = chunkText(c).length;
      if (c.kind === "text" && start >= at && caret <= at + len) {
        const head = c.text.slice(0, domOffset(c.text, start - at));
        let tail = c.text.slice(domOffset(c.text, caret - at));
        // Removing a token leaves one space where two would meet.
        if (!insert.length && /\s$/.test(head) && /^\s/.test(tail)) tail = tail.slice(1);
        const added = insert.length ? [...insert, { kind: "text" as const, text: " " }] : [];
        commit(
          [...r.chunks.slice(0, i), { kind: "text", text: head }, ...added, { kind: "text", text: tail }, ...r.chunks.slice(i + 1)],
          start + chunksText(added).length,
          true,
        );
        return;
      }
      at += len;
    }
  }

  /** A composer's copied chunks over the selection, chips and all. */
  function pasteChunks(insert: Chunk[]) {
    const el = box.current;
    if (!el) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.focusNode && el.contains(sel.focusNode)) document.execCommand("delete");
    const r = readEditor(el, point(el));
    // An emptied box holds only WebKit's placeholder break, which is not text.
    const next = isBlank(r.text) ? pasteAt([], 0, insert) : pasteAt(r.chunks, r.caret ?? r.text.length, insert);
    commit(next.chunks, next.caret, true);
  }

  // Place the caret once the remounted nodes exist, before paint.
  // Never touches the selection when the editor is unfocused (avoids stealing focus).
  useLayoutEffect(() => {
    const el = box.current;
    const target = landing.current;
    if (!el || !target) return;
    landing.current = null;
    if (!target.focus) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const resolve = (spot: { chunk: number; offset: number }): { node: Node; offset: number } => {
      const node = el.childNodes[spot.chunk];
      // A link's caret lands in its text.
      const text = node?.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).hasAttribute("data-link") ? node.firstChild : node;
      if (text && text.nodeType === Node.TEXT_NODE) {
        return { node: text, offset: Math.min(spot.offset, (text as Text).data.length) };
      }
      if (node) return { node: el, offset: spot.chunk };
      return { node: el, offset: el.childNodes.length };
    };
    const focusPt = resolve(target);
    if (target.anchor) {
      const anchorPt = resolve(target.anchor);
      if (typeof sel.setBaseAndExtent === "function") {
        sel.setBaseAndExtent(anchorPt.node, anchorPt.offset, focusPt.node, focusPt.offset);
      } else {
        const range = document.createRange();
        range.setStart(anchorPt.node, anchorPt.offset);
        range.setEnd(focusPt.node, focusPt.offset);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      const range = document.createRange();
      range.setStart(focusPt.node, focusPt.offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    revealCaret(el);
  }, [version]);

  useImperativeHandle(ref, () => ({
    insertMention(start, path) {
      splice(start, [{ kind: "chip", path }]);
    },
    insertSkill(start, name) {
      if (start != null) {
        splice(start, [{ kind: "skill", name }]);
        return;
      }
      const el = box.current;
      if (!el) return;
      const r = readEditor(el, point(el));
      if (r.chunks.some((c) => c.kind === "skill" && c.name === name)) return;
      const next = insertAt(r.chunks, r.caret ?? r.text.length, [{ kind: "skill", name }]);
      commit(next.chunks, next.caret, true);
    },
    removeSkill(name) {
      const el = box.current;
      if (!el) return;
      const r = readEditor(el, point(el));
      const next = dropSkill(r.chunks, name, r.caret ?? r.text.length);
      if (next.chunks !== r.chunks) commit(next.chunks, next.caret, true);
    },
    insertAttachments(paths) {
      const el = box.current;
      if (!el || !paths.length) return;
      const r = readEditor(el, point(el));
      const next = insertAt(r.chunks, r.caret ?? r.text.length, paths.map((path) => ({ kind: "attachment" as const, path })));
      commit(next.chunks, next.caret, true);
    },
    removeAttachment(path) {
      const el = box.current;
      if (!el) return;
      const r = readEditor(el, point(el));
      const next = dropAttachment(r.chunks, path, r.caret ?? r.text.length);
      if (next.chunks !== r.chunks) commit(next.chunks, next.caret);
    },
    removeToken(start) {
      splice(start, []);
    },
    pickedSkills() {
      const el = box.current;
      if (!el) return [];
      return readEditor(el, null).chunks.flatMap((c) => (c.kind === "skill" ? [c.name] : []));
    },
    clear() {
      commit([], 0);
    },
    replace(text) {
      const next = normalize(toChunks(text, skills ?? undefined));
      commit(next, chunksText(next).length, true);
    },
    prepend(text) {
      const el = box.current;
      if (!el) return;
      const kept = readEditor(el, null).chunks;
      const back = normalize(toChunks(text));
      commit(
        [...back, ...(kept.length ? [{ kind: "text" as const, text: "\n\n" }, ...kept] : [])],
        chunksText(back).length,
        true,
      );
    },
    append(text) {
      const el = box.current;
      if (!el) return;
      const kept = normalize(readEditor(el, null).chunks);
      const last = kept[kept.length - 1];
      if (last?.kind === "text") kept[kept.length - 1] = { kind: "text", text: last.text.trimEnd() };
      const head = chunksText(kept).trim() ? [...kept, { kind: "text" as const, text: "\n\n" }] : [];
      const next = normalize([...head, { kind: "text", text }]);
      commit(next, chunksText(next).length, true);
    },
  }));

  // Mount-time focus only (later focus is `commit`'s). WebKit focuses a
  // contenteditable with the caret at its start, so move it to the end.
  useLayoutEffect(() => {
    const el = box.current;
    if (!autoFocus || !el) return;
    placeCaretAtEnd(el);
  }, [autoFocus]);

  /** The mention a delete or arrow key would land on — only at the very edge of a text run. */
  function chipBeside(el: HTMLElement, dir: "back" | "forward"): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || !sel.isCollapsed) return null;
    const p = point(el);
    if (!p) return null;
    let side: Node | null = null;
    if (p.node.nodeType === Node.TEXT_NODE) {
      const raw = (p.node as Text).data;
      // The zero-width guard is not a character in the way.
      const rest = dir === "back" ? raw.slice(0, p.offset) : raw.slice(p.offset);
      if (rest.replace(ZWSP_RE, "")) return null;
      side = dir === "back" ? p.node.previousSibling : p.node.nextSibling;
    } else {
      side = p.node.childNodes[dir === "back" ? p.offset - 1 : p.offset] ?? null;
    }
    // Skip any empty or ZWSP-only sibling text nodes as defense-in-depth.
    while (side && side.nodeType === Node.TEXT_NODE && (side as Text).data.replace(ZWSP_RE, "") === "") {
      side = dir === "back" ? side.previousSibling : side.nextSibling;
    }
    return side && isChip(side) ? (side as HTMLElement) : null;
  }

  /** Delete a whole mention cleanly through the chunk model so guards, caret
   *  rects, and undo/redo history stay exact. */
  function removeChip(el: HTMLElement, chip: HTMLElement) {
    const ord = chipOrdinal(el, chip);
    if (ord < 0) return;
    const r = readEditor(el, point(el));
    const next = removeChipByOrdinal(r.chunks, ord);
    if (next) commit(next.chunks, next.caret, true);
  }

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const el = box.current;
    if (!el) return;
    const hit = enclosingChip(el, e.target as Node | null);
    const sel = window.getSelection();
    if (hit && (!sel || sel.isCollapsed || enclosingChip(el, sel.focusNode) === hit)) {
      el.focus();
      const side = chipSideForPoint(hit, e.clientX, e.clientY);
      moveCaretPastChip(el, hit, side);
      revealCaret(el);
    }
    sync();
  }

  function keyDown(e: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    const el = box.current;
    if (!el) return;
    const busyComposing = e.nativeEvent.isComposing || composing.current;
    if (!busyComposing) {
      const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      const lower = e.key.toLowerCase();
      if (mod && !e.altKey && (lower === "z" || (!isMac && lower === "y"))) {
        e.preventDefault();
        applyHistory(lower === "y" || e.shiftKey);
        return;
      }
    }
    if (busyComposing) return;
    if (e.key === "Enter" && e.shiftKey) {
      // Through the browser, so WebKit places its own trailing placeholder
      // (a hand-made `<br>` leaves the caret a line up).
      e.preventDefault();
      if (!document.execCommand("insertLineBreak")) {
        document.execCommand("insertText", false, "\n");
      }
      ensureChipGuards(el);
      const p = point(el);
      if (p && p.node.nodeType === Node.TEXT_NODE && (p.node as Text).data.slice(p.offset) === "\n") {
        placeholderNl.current = p.node as Text;
      }
      revealCaret(el);
      sync({ kind: "other" });
      cancelAnimationFrame(repaint.current);
      repaint.current = repaintCaret(el);
      return;
    }
    if (
      (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.ctrlKey
    ) {
      const chip = chipBeside(el, e.key === "ArrowLeft" ? "back" : "forward");
      if (!chip) return;
      e.preventDefault();
      moveCaretPastChip(el, chip, e.key === "ArrowLeft" ? "before" : "after");
      revealCaret(el);
      sync();
      return;
    }
    if (
      (e.key === "ArrowDown" || e.key === "ArrowUp") &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.ctrlKey
    ) {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.focusNode && el.contains(sel.focusNode)) {
        const beforeNode = sel.focusNode;
        const beforeOffset = sel.focusOffset;
        const dir = e.key === "ArrowDown" ? "down" : "up";
        if (arrowFallback.current != null) clearTimeout(arrowFallback.current);
        arrowFallback.current = setTimeout(() => {
          arrowFallback.current = null;
          const cur = box.current;
          const s = window.getSelection();
          if (!cur || !s || !s.isCollapsed || !cur.contains(document.activeElement)) return;
          if (s.focusNode === beforeNode && s.focusOffset === beforeOffset) {
            if (stepVerticallyPastChip(cur, dir)) {
              revealCaret(cur);
              sync();
            }
          }
        }, 0);
      }
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      const chip = chipBeside(el, e.key === "Backspace" ? "back" : "forward");
      if (!chip) return;
      e.preventDefault();
      removeChip(el, chip);
    }
  }

  return (
    <div className="relative">
      <div
        key={version}
        ref={box}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        aria-placeholder={placeholder}
        // `select-text`: `index.css` turns selection off app-wide, and without it
        // WebKit can barely edit the box. `overflow-x-hidden`:
        // y=auto computes x to auto, and always-on scrollbars paint a bar across a one-line box.
        className="max-h-[160px] min-h-[16px] w-full overflow-x-hidden overflow-y-auto break-words whitespace-pre-wrap select-text text-[13px] leading-[16px] outline-none"
        onInput={input}
        // `overflow-x-hidden` still scrolls: WebKit's own caret reveal can nudge a
        // few px sideways and clip the first letters of every line.
        onScroll={(e) => {
          if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0;
        }}
        onMouseDown={(e) => {
          lastPointer.current = { x: e.clientX, y: e.clientY, at: Date.now() };
        }}
        onKeyUp={() => {
          if (!composing.current) sync();
        }}
        onClick={handleClick}
        onFocus={() => {
          const el = box.current;
          if (el && !composing.current) ensureChipGuards(el);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          if (box.current) ensureChipGuards(box.current);
          if (!linkify("settled")) sync({ kind: "other" });
        }}
        onKeyDown={keyDown}
        onBlur={onBlur}
        onCopy={(e) => {
          if (box.current && copySelection(box.current, e.clipboardData)) e.preventDefault();
        }}
        onCut={(e) => {
          const el = box.current;
          if (!el || !copySelection(el, e.clipboardData)) return;
          e.preventDefault();
          document.execCommand("delete");
          ensureChipGuards(el);
          sync({ kind: "other" });
        }}
        onPaste={(e) => {
          // Plain text only (rich fragments bring their own elements); a
          // clipboard file (a picture, PDF or text file) wins over any text
          // flavour it carries.
          e.preventDefault();
          const files = onFiles ? attachableFiles(e.clipboardData.files) : [];
          if (files.length) {
            onFiles?.(files);
            return;
          }
          const own = copiedChunks(e.clipboardData, skills ?? null);
          if (own) {
            pasteChunks(own);
            return;
          }
          const plain = e.clipboardData.getData("text/plain");
          if (plain && onPasteText?.(plain)) return;
          if (plain && box.current) {
            const el = box.current;
            const prevChip = chipBeside(el, "back");
            const nextChip = chipBeside(el, "forward");
            const needLead = prevChip?.hasAttribute("data-skill") === true && !/^\s/.test(plain);
            const needTrail = nextChip?.hasAttribute("data-skill") === true && !/\s$/.test(plain);
            const text = `${needLead ? " " : ""}${plain}${needTrail ? " " : ""}`;
            guardingInsert.current = true;
            try {
              document.execCommand("insertText", false, text);
            } finally {
              guardingInsert.current = false;
            }
          }
          if (box.current) {
            ensureChipGuards(box.current);
            revealCaret(box.current);
          }
          if (!linkify("all")) sync({ kind: "other" });
        }}
      >
        {chunks.length > 0 ? (
          chunks.map((c, i) =>
            c.kind === "text" ? (
              drawnText(c.text, i === chunks.length - 1)
            ) : c.kind === "link" ? (
              <ComposerLink key={i} raw={c.raw} />
            ) : c.kind === "skill" ? (
              <SkillChip key={i} name={c.name} />
            ) : c.kind === "attachment" ? (
              <AttachmentChip key={i} path={c.path} />
            ) : (
              <CheckedFileChip key={i} path={c.path} />
            ),
          )
        ) : (
          <br />
        )}
      </div>
      {blank && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 select-none text-[13px] leading-[16px] text-muted-foreground",
            oneLinePlaceholder && "truncate",
          )}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
