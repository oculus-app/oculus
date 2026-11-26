import { describe, expect, test } from "bun:test";
import { seriesPartRequest } from "@/lib/studio/seriesRequest";
import { createSeriesMakeStore, partChatKey, readPartChats, type PartChats } from "@/stores/studio/seriesMakeState";
import { part, series, video } from "./seriesFixtures";

describe("Make this part's request", () => {
  test("an unsent skill draft naming both slugs", () => {
    const outline = series({ parts: [part(2)] });
    expect(seriesPartRequest(outline, 2)).toEqual({ draft: "/oculus-studio Make part 2 of the series `motion` (video `part-2`)." });
    expect(() => seriesPartRequest(outline, 0)).toThrow("not in the series");
    expect(() => seriesPartRequest(series({ parts: [part(1, { made: true })] }), 1)).toThrow("already has a render");
  });
});

/** A store over fake Chat drafts, threads and storage, as the app wires them. */
function setup(stored: { raw: string | null } = { raw: null }) {
  const listed = new Set<string>();
  const opened: [string | null, string][] = [];
  const shown: string[] = [];
  let next = 0;
  const store = createSeriesMakeStore({
    load: () => readPartChats(stored.raw),
    save: (chats: PartChats) => { stored.raw = JSON.stringify(chats); },
    draftListed: (id) => listed.has(id),
  });
  const open = {
    fresh: (subject: string | null, text: string) => {
      const id = `d${++next}`;
      listed.add(id);
      opened.push([subject, text]);
      return id;
    },
    show: (id: string) => { shown.push(id); },
  };
  return { store, listed, opened, shown, open, stored };
}

const outline = (extra: Parameters<typeof series>[0] = {}) =>
  series({ parts: [part(1, { exists: true, made: true, video: video("part-1", { threadId: 3 }) }), part(2), part(3)], ...extra });
const chat = (t: ReturnType<typeof setup>, n: number) => t.store.getState().chats[partChatKey("motion", `part-${n}`)];

describe("a part's chat", () => {
  test("Make opens a new chat in the series' subject with the request unsent", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    expect(t.opened).toEqual([["PHYS", "/oculus-studio Make part 2 of the series `motion` (video `part-2`)."]]);
    expect(chat(t, 2)).toEqual({ series: "motion", part: "part-2", draftId: "d1", threadId: null });
  });
  test("pressing it again while the draft is unsent shows that draft, not another", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().make(outline(), 2, t.open);
    expect(t.opened).toHaveLength(1);
    expect(t.shown).toEqual(["d1"]);
  });
  test("a draft gone from Chat opens a fresh one", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.listed.delete("d1");
    t.store.getState().make(outline(), 2, t.open);
    expect(t.shown).toEqual([]);
    expect(chat(t, 2).draftId).toBe("d2");
  });
  test("a made part opens nothing", () => {
    const t = setup();
    t.store.getState().make(outline(), 1, t.open);
    expect(t.opened).toEqual([]);
    expect(t.store.getState().chats).toEqual({});
  });
  test("the first send records the thread; the draft it leaves behind is not a discard", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().sent("d1", 9);
    t.listed.delete("d1");
    t.store.getState().observe([outline()]);
    expect(chat(t, 2)).toMatchObject({ draftId: "d1", threadId: 9 });
    // Sent, so pressing again opens a fresh chat rather than showing the old draft.
    t.store.getState().make(outline(), 2, t.open);
    expect(t.shown).toEqual([]);
    expect(chat(t, 2)).toMatchObject({ draftId: "d2", threadId: null });
  });
  test("a draft discarded unsent drops the entry", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.listed.delete("d1");
    t.store.getState().observe(null);
    expect(chat(t, 2)).toBeUndefined();
  });
  test("a sent draft another chat never sent is not touched", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().sent("other", 9);
    expect(chat(t, 2).threadId).toBeNull();
  });
  test("the entry goes once the part's folder is linked to its chat: the link is then the truth", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().sent("d1", 9);
    const linked = outline();
    linked.parts[1] = part(2, { exists: true, video: video("part-2", { threadId: 9 }) });
    t.store.getState().observe([linked]);
    expect(chat(t, 2)).toBeUndefined();
  });
  test("a sent chat with no folder yet stays the part's chat until it is deleted", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().make(outline(), 3, t.open);
    t.store.getState().sent("d1", 9);
    t.listed.delete("d1");
    t.store.getState().observe([outline()]);
    t.store.getState().observe(null);
    expect(chat(t, 2)?.threadId).toBe(9);
    t.store.getState().gone(9);
    expect(chat(t, 2)).toBeUndefined();
    expect(chat(t, 3)).toBeDefined();
  });
  test("a draft pruned while its send is in flight keeps its part", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.listed.delete("d1");
    t.store.getState().observe([outline()]);
    expect(chat(t, 2)).toBeUndefined();
    t.store.getState().sent("d1", 9);
    expect(chat(t, 2)).toEqual({ series: "motion", part: "part-2", draftId: "d1", threadId: 9 });
  });
  test("a late send leaves a newer chat opened for the same part", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.listed.delete("d1");
    t.store.getState().observe([outline()]);
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().sent("d1", 9);
    expect(chat(t, 2)).toMatchObject({ draftId: "d2", threadId: null });
  });
  test("a folder with no link keeps the entry", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().sent("d1", 9);
    const unlinked = outline();
    unlinked.parts[1] = part(2, { exists: true, video: video("part-2") });
    t.store.getState().observe([unlinked]);
    expect(chat(t, 2)?.threadId).toBe(9);
  });
  test("a folder an earlier chat left without a render keeps the new chat's entry", () => {
    const t = setup();
    const left = outline();
    left.parts[1] = part(2, { exists: true, video: video("part-2", { threadId: 5 }) });
    t.store.getState().make(left, 2, t.open);
    t.store.getState().observe([left]);
    t.store.getState().make(left, 2, t.open);
    expect(t.shown).toEqual(["d1"]);
    t.store.getState().sent("d1", 9);
    t.listed.delete("d1");
    t.store.getState().observe([left]);
    expect(chat(t, 2)?.threadId).toBe(9);
    left.parts[1] = part(2, { exists: true, made: true, video: video("part-2", { threadId: 5 }) });
    t.store.getState().observe([left]);
    expect(chat(t, 2)).toBeUndefined();
  });
  test("two parts are made at once, each in its own chat", () => {
    const t = setup();
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().make(outline(), 3, t.open);
    t.store.getState().sent("d1", 9);
    t.store.getState().sent("d2", 10);
    t.store.getState().observe([outline()]);
    expect([chat(t, 2).threadId, chat(t, 3).threadId]).toEqual([9, 10]);
  });
  test("a reload keeps which chat makes which part", () => {
    const stored = { raw: null as string | null };
    const t = setup(stored);
    t.store.getState().make(outline(), 2, t.open);
    t.store.getState().sent("d1", 9);
    expect(setup(stored).store.getState().chats).toEqual(t.store.getState().chats);
  });
  test("damaged storage reads as nothing, entry by entry", () => {
    expect(readPartChats("not json")).toEqual({});
    expect(readPartChats("[]")).toEqual({});
    const good = { series: "motion", part: "part-2", draftId: "d1", threadId: 9 };
    expect(readPartChats(JSON.stringify({
      "motion/part-2": good,
      "motion/part-3": { ...good, part: "part-3", threadId: "9" },
      "wrong/key": { ...good, part: "part-4" },
    }))).toEqual({ "motion/part-2": good });
  });
});
