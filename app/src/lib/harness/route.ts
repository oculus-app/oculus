import { parseChatScope, type ChatScope } from "./scope";

/**
 * The route for a Chat tab showing one conversation, or with no id the empty
 * composer. The thread lives only in the route: every tab has its own router
 * (`TabPane`), so two tabs hold two conversations and back walks between them.
 * `n` is the name, because `tabInfo` titles a tab from its path alone. `d`
 * names a new chat not yet sent (`draftStore.newChats`); bare `/chat` gets
 * one. `s` on a new chat is an entry point's scope (a group's "+"): the page
 * seeds the new chat's choice from it once and drops it from the route.
 * `c=1` likewise opens the subject picker once on arrival (Studio's New video).
 */
export function chatHref(
  threadId?: number | null,
  title?: string | null,
  opts?: { subject?: ChatScope; draft?: string; choose?: boolean },
): string {
  if (threadId == null) {
    const q = new URLSearchParams();
    if (opts?.draft) q.set("d", opts.draft);
    if (opts?.subject != null) q.set("s", String(opts.subject));
    if (opts?.choose) q.set("c", "1");
    const query = q.toString();
    return query ? `/chat?${query}` : "/chat";
  }
  const name = title?.trim();
  return name ? `/chat?t=${threadId}&n=${encodeURIComponent(name)}` : `/chat?t=${threadId}`;
}

/** The thread id a Chat route names, or null for the empty composer. */
export function chatThreadId(search: string): number | null {
  const raw = new URLSearchParams(search).get("t");
  const id = raw == null ? NaN : Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The new chat a route names (`d`), or null. */
export function chatDraftId(search: string): string | null {
  const raw = new URLSearchParams(search).get("d");
  return raw && /^[a-z0-9]{1,24}$/.test(raw) ? raw : null;
}

/** Whether a new-chat route asks to open the subject picker (`c`). */
export function chatChoose(search: string): boolean {
  return new URLSearchParams(search).get("c") === "1";
}

/** The scope a new-chat route asks to start in, or null when it names none. */
export function chatScope(search: string): ChatScope | null {
  return parseChatScope(new URLSearchParams(search).get("s"));
}
