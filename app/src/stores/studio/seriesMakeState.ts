import { create } from "zustand";

import { seriesPartRequest } from "@/lib/studio/seriesRequest";
import type { StudioSeries } from "@/lib/studio/videos";

/** The new chat Make this part opened for one part: its draft until the
 *  first send, then the thread that send created. */
export interface PartChat {
  series: string;
  part: string;
  draftId: string;
  threadId: number | null;
}

/** Keyed by `partChatKey`. */
export type PartChats = Record<string, PartChat>;

export const partChatKey = (series: string, part: string) => `${series}/${part}`;

const isPartChat = (v: unknown): v is PartChat => {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<PartChat>;
  return typeof c.series === "string" && typeof c.part === "string" && typeof c.draftId === "string" &&
    (c.threadId === null || (typeof c.threadId === "number" && Number.isInteger(c.threadId)));
};

/** The stored map, damaged entries dropped; anything unreadable is none. */
export function readPartChats(raw: string | null): PartChats {
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, c]) =>
      isPartChat(c) && key === partChatKey(c.series, c.part)));
  } catch {
    return {};
  }
}

/** Each part slug's remembered thread in one series. */
export function rememberedThreads(chats: PartChats, series: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of Object.values(chats)) if (c.series === series && c.threadId != null) out[c.part] = c.threadId;
  return out;
}

/** The part chat a thread was created from, if any. */
export function chatForThread(chats: PartChats, threadId: number): PartChat | null {
  return Object.values(chats).find((c) => c.threadId === threadId) ?? null;
}

export interface PartDraftOpener {
  /** Opens a fresh new chat holding `text`, in the subject; returns its draft id. */
  fresh: (subject: string | null, text: string) => string;
  /** Shows a new chat already open; `text` refills it only if it holds nothing. */
  show: (draftId: string, text: string) => void;
}

export interface SeriesMakeDependencies {
  load: () => PartChats;
  save: (chats: PartChats) => void;
  /** Whether a new chat is still listed, unsent (`draftStore.newChats`). */
  draftListed: (draftId: string) => boolean;
}

export interface SeriesMakeState {
  chats: PartChats;
  /** Opens the part's new chat, or shows the one already open and unsent. */
  make: (series: StudioSeries, partNumber: number, open: PartDraftOpener) => void;
  /** A new chat's first send created `threadId`. */
  sent: (draftId: string, threadId: number) => void;
  /** A remembered thread was deleted. */
  gone: (threadId: number) => void;
  /** Drops what is settled. `series` is null until the video list has loaded. */
  observe: (series: StudioSeries[] | null) => void;
}

/**
 * Which chat makes each series part before its folder is linked to that
 * chat, outside React so navigation never owns it. An entry goes once the
 * folder is linked to its chat (the link is then the truth), the part is
 * made, its draft is discarded unsent, or its chat is deleted.
 */
export function createSeriesMakeStore(deps: SeriesMakeDependencies) {
  return create<SeriesMakeState>((set, get) => {
    const commit = (chats: PartChats) => {
      deps.save(chats);
      set({ chats });
    };
    // The composer empties a draft before its send resolves, so one pruned
    // meanwhile reads as discarded: `sent` takes its entry back from here.
    const discarded = new Map<string, [string, PartChat]>();
    return {
      chats: deps.load(),
      make: (series, partNumber, open) => {
        const part = series.parts.find((p) => p.number === partNumber);
        if (!part || part.made) return;
        const { draft } = seriesPartRequest(series, partNumber);
        const key = partChatKey(series.slug, part.slug);
        const known = get().chats[key];
        if (known && known.threadId == null && deps.draftListed(known.draftId)) {
          open.show(known.draftId, draft);
          return;
        }
        const draftId = open.fresh(series.subject, draft);
        commit({ ...get().chats, [key]: { series: series.slug, part: part.slug, draftId, threadId: null } });
      },
      sent: (draftId, threadId) => {
        const chats = get().chats;
        const dropped = discarded.get(draftId);
        discarded.delete(draftId);
        const entry = Object.entries(chats).find(([, c]) => c.draftId === draftId && c.threadId == null) ??
          (dropped && !(dropped[0] in chats) ? dropped : undefined);
        if (entry) commit({ ...chats, [entry[0]]: { ...entry[1], threadId } });
      },
      gone: (threadId) => {
        const chats = get().chats;
        const kept = Object.fromEntries(Object.entries(chats).filter(([, c]) => c.threadId !== threadId));
        if (Object.keys(kept).length !== Object.keys(chats).length) commit(kept);
      },
      observe: (series) => {
        const chats = get().chats;
        const kept: PartChats = {};
        for (const [key, chat] of Object.entries(chats)) {
          if (keep(chat, series, deps)) kept[key] = chat;
          else if (chat.threadId == null) discarded.set(chat.draftId, [key, chat]);
        }
        if (Object.keys(kept).length !== Object.keys(chats).length) commit(kept);
      },
    };
  });
}

/** A sent chat stays the part's chat while its turn is stopped, asks a
 *  question or was cut by a relaunch, and while the folder has no link or is
 *  linked to an earlier chat: nothing else names this chat for the part. */
function keep(chat: PartChat, list: StudioSeries[] | null, deps: SeriesMakeDependencies): boolean {
  const part = list?.find((s) => s.slug === chat.series)?.parts.find((p) => p.slug === chat.part);
  if (list != null && (!part || part.made)) return false;
  if (chat.threadId == null) return deps.draftListed(chat.draftId);
  return part?.video?.threadId !== chat.threadId;
}
