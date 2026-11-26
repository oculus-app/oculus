import { create } from "zustand";

import type { Subject } from "@/lib/db";
import type { PastedText } from "@/lib/harness/attachments";
import { stripControlChars } from "@/lib/harness/controlChars";
import { isChatScope, liveScope, type ChatScope } from "@/lib/harness/scope";

/** One string per composer: an empty box is no entry. */
type Drafts = Record<string, string>;

/** Long pastes held as cards, per composer: none is no entry. */
type Pastes = Record<string, PastedText[]>;

/** A new thread's chosen scope, per composer: unchosen is no entry. */
type Scopes = Record<string, ChatScope>;

/** Pictures attached to a draft, as `./attachments/…` paths: the shelf of
 *  thumbnails. A PDF or text file is only its chip, so it is never here. */
type Shelves = Record<string, string[]>;

/** The Chat page's new chats not yet sent: id → when it was opened (ms). */
type NewChats = Record<string, number>;

const KEY = "oculus.chatDrafts";
const PASTES_KEY = "oculus.chatPastes";
const SCOPES_KEY = "oculus.chatScopes";
const SHELVES_KEY = "oculus.chatShelves";
const NEW_CHATS_KEY = "oculus.chatNewChats";
/** The single new-chat draft key from before each new chat had an id. */
const LEGACY_NEW = "new:chat";

/** A composer's key: its thread, or the not-yet-thread it would start
 *  (`scope` tells the Chat page's new thread from each lecture's). */
export function draftKey(threadId: number | null, scope: string): string {
  return threadId == null ? `new:${scope}` : `thread:${threadId}`;
}

/** A Chat page new chat's composer key (`chatHref`'s `d`). */
export function newChatKey(id: string): string {
  return draftKey(null, `chat:${id}`);
}

/** Whether a composer holds anything of the student's: words, a pasted
 *  card or a picture. Blank text is nothing (an emptied box keeps a lone
 *  line break), and neither is a chosen scope alone. */
export function hasDraft(s: Held, key: string): boolean {
  return !!s.drafts[key]?.trim() || !!s.pastes[key]?.length || !!s.shelves[key]?.length;
}

/** A stored map, keeping only the entries `valid` accepts. */
function read<T>(key: string, valid: (v: unknown) => v is T): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, T] => valid(e[1])));
  } catch {
    return {};
  }
}

function write(key: string, map: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* quota or private mode — the in-memory copy still covers a thread switch */
  }
}

const isString = (v: unknown): v is string => typeof v === "string";

/** The scopes as storage holds them, damaged entries dropped: what a launch reads. */
export const storedScopes = (): Scopes => read(SCOPES_KEY, isChatScope);

const isPastes = (v: unknown): v is PastedText[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      p != null &&
      typeof p === "object" &&
      typeof (p as PastedText).id === "string" &&
      typeof (p as PastedText).text === "string",
  );

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A new chat's id: short, sortable enough, and safe in a query string. */
function newId(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
}

/** The maps as storage holds them, with the old single new-chat draft moved
 *  under a new chat of its own so its words survive. */
function initial() {
  const drafts: Drafts = Object.fromEntries(
    Object.entries(read(KEY, isString))
      .map(([key, text]) => [key, stripControlChars(text)])
      .filter(([, text]) => text),
  );
  const pastes = read(PASTES_KEY, isPastes);
  const scopes = storedScopes();
  const shelves = read(SHELVES_KEY, isStrings);
  const newChats = read(NEW_CHATS_KEY, isNumber);
  const maps: Record<string, unknown>[] = [drafts, pastes, scopes, shelves];
  if (maps.some((m) => LEGACY_NEW in m)) {
    const id = newId();
    const key = newChatKey(id);
    for (const m of maps) {
      if (!(LEGACY_NEW in m)) continue;
      m[key] = m[LEGACY_NEW];
      delete m[LEGACY_NEW];
    }
    newChats[id] = Date.now();
    write(KEY, drafts);
    write(PASTES_KEY, pastes);
    write(SCOPES_KEY, scopes);
    write(SHELVES_KEY, shelves);
    write(NEW_CHATS_KEY, newChats);
  }
  return { drafts, pastes, scopes, shelves, newChats };
}

interface DraftState {
  drafts: Drafts;
  pastes: Pastes;
  scopes: Scopes;
  shelves: Shelves;
  newChats: NewChats;
  /** A fresh new chat, returning its id. New chats holding nothing are
   *  dropped first, so leaving an empty one behind leaves no row. */
  openNewChat: () => string;
  /** The newest new chat holding nothing, else a fresh one (bare `/chat`). */
  emptyNewChat: () => string;
  /** Forgets a new chat and everything its composer held (sent or discarded). */
  dropNewChat: (id: string) => void;
  /** Lists a new chat a tab shows that the list dropped (back to an empty
   *  one, or another tab's New pruned it). */
  keepNewChat: (id: string) => void;
  setDraft: (key: string, text: string) => void;
  setPastes: (key: string, list: PastedText[]) => void;
  setShelf: (key: string, paths: string[]) => void;
  /** The scope chosen for a new thread's composer; null forgets the choice. */
  setScope: (key: string, scope: ChatScope | null) => void;
  /** That choice, if it still names General or a subject in `subjects`. */
  scopeFor: (key: string, subjects: readonly Pick<Subject, "id">[]) => ChatScope | null;
}

/**
 * Unsent words per composer, so switching thread, tab or lecture (which
 * unmounts a composer) never loses them. In localStorage as well, because a
 * `tauri dev` rebuild relaunches the app. Long pastes held as cards
 * (`PastedText`) are kept the same way, under the same key, and so are the
 * pictures on its shelf (written to `agents/attachments/` when attached) and
 * the scope a new Chat thread will start in (`ChatScope`), until it is sent.
 * Each new chat on the Chat page has an id (`newChats`), so several can wait
 * as rows above the thread list.
 */
export const useDraftStore = create<DraftState>((set, get) => ({
  ...initial(),
  openNewChat: () => {
    const s = get();
    const next: NewChats = {};
    for (const [id, at] of Object.entries(s.newChats)) if (hasDraft(s, newChatKey(id))) next[id] = at;
    const id = newId();
    next[id] = Date.now();
    write(NEW_CHATS_KEY, next);
    set({ newChats: next });
    return id;
  },
  emptyNewChat: () => {
    const s = get();
    const empty = Object.entries(s.newChats)
      .filter(([id]) => !hasDraft(s, newChatKey(id)))
      .sort((a, b) => b[1] - a[1])[0];
    return empty ? empty[0] : get().openNewChat();
  },
  keepNewChat: (id) => {
    const s = get();
    if (id in s.newChats) return;
    const next = { ...s.newChats, [id]: Date.now() };
    write(NEW_CHATS_KEY, next);
    set({ newChats: next });
  },
  dropNewChat: (id) => {
    const s = get();
    if (!(id in s.newChats)) return;
    const key = newChatKey(id);
    const next = { ...s.newChats };
    delete next[id];
    write(NEW_CHATS_KEY, next);
    set({ newChats: next });
    s.setDraft(key, "");
    s.setPastes(key, []);
    s.setShelf(key, []);
    s.setScope(key, null);
  },
  setDraft: (key, text) => {
    const prev = get().drafts;
    if ((prev[key] ?? "") === text) return;
    const next = { ...prev };
    if (text) next[key] = text;
    else delete next[key];
    write(KEY, next);
    set({ drafts: next });
  },
  setPastes: (key, list) => {
    const prev = get().pastes;
    if (!list.length && !prev[key]) return;
    const next = { ...prev };
    if (list.length) next[key] = list;
    else delete next[key];
    write(PASTES_KEY, next);
    set({ pastes: next });
  },
  setShelf: (key, paths) => {
    const prev = get().shelves;
    if (!paths.length && !prev[key]) return;
    const next = { ...prev };
    if (paths.length) next[key] = paths;
    else delete next[key];
    write(SHELVES_KEY, next);
    set({ shelves: next });
  },
  setScope: (key, scope) => {
    const prev = get().scopes;
    if (prev[key] === (scope ?? undefined)) return;
    const next = { ...prev };
    if (scope != null) next[key] = scope;
    else delete next[key];
    write(SCOPES_KEY, next);
    set({ scopes: next });
  },
  scopeFor: (key, subjects) => liveScope(get().scopes[key], subjects),
}));

type Held = Pick<DraftState, "drafts" | "pastes" | "shelves">;

/** Every composer key holding something. */
function holding(s: Held): string[] {
  const keys = new Set([...Object.keys(s.drafts), ...Object.keys(s.pastes), ...Object.keys(s.shelves)]);
  return [...keys].filter((key) => hasDraft(s, key));
}

/** Composers a tab has left holding something; seeded with every stored one,
 *  since a relaunch left them all. Not state: nothing redraws when it changes. */
const left = new Set(holding(useDraftStore.getState()));

// One emptied (sent, discarded or cleared) is left no longer, so typing in it
// again lists nothing.
useDraftStore.subscribe((s) => {
  for (const key of left) if (!hasDraft(s, key)) left.delete(key);
});

/** A tab left the composer `key`: remembered if it holds something. */
export function leaveDraft(key: string): void {
  if (hasDraft(useDraftStore.getState(), key)) left.add(key);
}

/** Whether a thread list shows the draft of the composer its tab has open:
 *  only one a tab left holding something, until it is emptied. So typing in
 *  the open composer changes no list. */
export function listsOpenDraft(s: Held, key: string): boolean {
  return left.has(key) && hasDraft(s, key);
}
