import { expect, test } from "bun:test";
import type { HistoryEvent, Pronunciation } from "@/lib/studio/pronunciations";
import {
  canRevert,
  inLibrary,
  libraryCodes,
  matchesQuery,
  openingTab,
  utcStampMs,
} from "@/lib/studio/pronunciationView";
import { createPendingStore } from "@/stores/studio/pronunciationCountStore";

const item = (status: Pronunciation["status"], id = status): Pronunciation => ({
  id,
  word: "Nesterov",
  reading: "NESS-ter-off",
  original: "nˈɛstəɹɔv",
  guessed: true,
  subject: "COMP30027",
  video: "momentum",
  sentence: "Nesterov looks ahead.",
  scene: "s1",
  line: 3,
  status,
  note: null,
  created: "2026-11-28T01:02:03",
});

const event = (kind: HistoryEvent["kind"], reverted = false): HistoryEvent => ({
  id: kind,
  at: "2026-11-28T01:02:03",
  kind,
  word: "softmax",
  subject: null,
  previous: null,
  reading: "SOFT-max",
  note: null,
  video: null,
  reverts: null,
  reverted,
});

test("the library filter tells All, Global and a subject apart", () => {
  expect(inLibrary("all", null)).toBe(true);
  expect(inLibrary("all", "COMP30027")).toBe(true);
  expect(inLibrary("global", null)).toBe(true);
  expect(inLibrary("global", "COMP30027")).toBe(false);
  expect(inLibrary({ code: "COMP30027" }, "COMP30027")).toBe(true);
  expect(inLibrary({ code: "COMP30027" }, null)).toBe(false);
});

test("the word filter matches any field in any case, and a blank one everything", () => {
  expect(matchesQuery("  ", "x")).toBe(true);
  expect(matchesQuery("SOFT", null, "softmax")).toBe(true);
  expect(matchesQuery("relu", "softmax", undefined)).toBe(false);
});

test("library codes join the data's and the list's, once each, sorted", () => {
  expect(libraryCodes([null, "MAST20005", "COMP30027"], ["COMP30027", "ABCD10001"])).toEqual([
    "ABCD10001",
    "COMP30027",
    "MAST20005",
  ]);
});

test("Revert is offered on the lexicon kinds that are not yet reverted", () => {
  for (const kind of ["accepted", "kept", "added", "edited", "removed"] as const) {
    expect(canRevert(event(kind))).toBe(true);
    expect(canRevert(event(kind, true))).toBe(false);
  }
  expect(canRevert(event("wrong"))).toBe(false);
  expect(canRevert(event("reverted"))).toBe(false);
});

test("a stored stamp reads as UTC", () => {
  expect(utcStampMs("2026-11-28T01:02:03")).toBe(Date.UTC(2026, 10, 28, 1, 2, 3));
  expect(utcStampMs("nonsense")).toBeUndefined();
});

test("the page opens on Review only while a suggestion waits", () => {
  expect(openingTab([item("pending")])).toBe("review");
  expect(openingTab([item("wrong")])).toBe("lexicon");
  expect(openingTab([])).toBe("lexicon");
});

test("the nav count counts pending suggestions, and the newest read wins", async () => {
  const reads: ((value: Pronunciation[]) => void)[] = [];
  const store = createPendingStore(() => new Promise((resolve) => reads.push(resolve)));
  const first = store.getState().reload();
  const second = store.getState().reload();
  reads[1]([item("pending", "a"), item("pending", "b"), item("wrong", "c")]);
  await second;
  expect(store.getState().pending).toBe(2);
  reads[0]([]);
  await first;
  expect(store.getState().pending).toBe(2);
  store.getState().setFrom([item("wrong")]);
  expect(store.getState().pending).toBe(0);
});
