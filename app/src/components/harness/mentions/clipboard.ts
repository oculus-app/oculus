import { skillText } from "@/lib/harness/skills";
import type { Chunk } from "./chunks";
import { readEditor } from "./dom";

/** The flavour a copy from a composer carries beside its plain text: the
 *  selection's chunks, so a paste into a composer keeps its mentions,
 *  attachments and skills as chips. */
const CHUNKS_TYPE = "application/x-oculus-composer";

/**
 * Writes the box's selection to `data` as the message spells it (a skill is
 * `/name`, a mention its backticked path) and as chunks. WebKit's own copy
 * takes the drawn text, so a chip would paste as its label. False when the
 * selection is empty or not in the box.
 */
export function copySelection(root: HTMLElement, data: DataTransfer): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  const holder = document.createElement("div");
  holder.append(range.cloneContents());
  const { text, chunks } = readEditor(holder, null);
  data.setData("text/plain", text);
  data.setData(CHUNKS_TYPE, JSON.stringify(chunks));
  return true;
}

function asChunk(value: unknown, skills: ReadonlySet<string> | null): Chunk | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (c.kind === "text" && typeof c.text === "string") return { kind: "text", text: c.text };
  if (c.kind === "link" && typeof c.raw === "string") return { kind: "link", raw: c.raw };
  if ((c.kind === "chip" || c.kind === "attachment") && typeof c.path === "string") return { kind: c.kind, path: c.path };
  if (c.kind === "skill" && typeof c.name === "string") {
    // A skill no longer installed pastes as its words.
    return skills?.has(c.name) ? { kind: "skill", name: c.name } : { kind: "text", text: skillText(c.name) };
  }
  return null;
}

/** The chunks a composer copied, when they hold a chip or link; null for any
 *  other clipboard, and for plain words, which paste as text does. */
export function copiedChunks(data: DataTransfer, skills: ReadonlySet<string> | null): Chunk[] | null {
  const raw = data.getData(CHUNKS_TYPE);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const chunks = parsed.map((v) => asChunk(v, skills));
    if (chunks.some((c) => c == null) || chunks.every((c) => c?.kind === "text")) return null;
    return chunks as Chunk[];
  } catch {
    return null;
  }
}
