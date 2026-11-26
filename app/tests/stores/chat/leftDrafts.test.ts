import { afterEach, beforeEach, expect, test } from "bun:test";
import { leaveDraft, listsOpenDraft, newChatKey, useDraftStore } from "@/stores/chat/draftStore";

const previous = (globalThis as { localStorage?: Storage }).localStorage;
beforeEach(() => {
  Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } });
  useDraftStore.setState({ drafts: {}, pastes: {}, shelves: {} });
});
afterEach(() => {
  Object.assign(globalThis, { localStorage: previous });
});

const state = () => useDraftStore.getState();
const KEY = newChatKey("abc");

test("typing in the open composer lists nothing until a tab leaves it", () => {
  state().setDraft(KEY, "first words");
  expect(listsOpenDraft(state(), KEY)).toBe(false);
  leaveDraft(KEY);
  expect(listsOpenDraft(state(), KEY)).toBe(true);
  state().setDraft(KEY, "first words and more");
  expect(listsOpenDraft(state(), KEY)).toBe(true);
});

test("leaving an empty composer lists nothing", () => {
  state().setDraft(KEY, "\n");
  leaveDraft(KEY);
  state().setDraft(KEY, "words");
  expect(listsOpenDraft(state(), KEY)).toBe(false);
});

test("one emptied is unlisted, and typing in it again does not list it", () => {
  state().setDraft(KEY, "words");
  leaveDraft(KEY);
  state().setDraft(KEY, "");
  expect(listsOpenDraft(state(), KEY)).toBe(false);
  state().setDraft(KEY, "new words");
  expect(listsOpenDraft(state(), KEY)).toBe(false);
  leaveDraft(KEY);
  expect(listsOpenDraft(state(), KEY)).toBe(true);
});

test("a pasted card or a picture is something to leave", () => {
  state().setShelf(KEY, ["./attachments/a.png"]);
  leaveDraft(KEY);
  expect(listsOpenDraft(state(), KEY)).toBe(true);
  state().setShelf(KEY, []);
  expect(listsOpenDraft(state(), KEY)).toBe(false);
});
