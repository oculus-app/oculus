/**
 * Each thread's last-read preview line, kept across mounts so a list drawn
 * again (Chat reopened) shows its lines from the first frame; the fresh read
 * then replaces them. A thread updated since shows its older line until then.
 */
const lines = new Map<number, string>();

export function cachedPreviews(ids: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const id of ids) {
    const text = lines.get(id);
    if (text != null) out.set(id, text);
  }
  return out;
}

export function rememberPreviews(read: ReadonlyMap<number, string>): void {
  for (const [id, text] of read) lines.set(id, text);
}
