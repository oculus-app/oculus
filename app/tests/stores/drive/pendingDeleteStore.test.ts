import { afterAll, beforeEach, expect, mock, test } from "bun:test";

const calls: Array<[string, unknown]> = [];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: unknown) => {
    calls.push([cmd, args]);
    return cmd === "drive_delete_undo" ? ["Exam"] : undefined;
  },
}));
afterAll(() => {
  // Module mocks outlive the file; leave later files an invoke that fails as it does without Tauri.
  mock.module("@tauri-apps/api/core", () => ({
    invoke: async () => {
      throw new Error("Tauri is not available");
    },
  }));
});

const { isPendingDelete, usePendingDeleteStore, withinRemoved } = await import("@/stores/drive/pendingDeleteStore");

beforeEach(() => {
  calls.length = 0;
  usePendingDeleteStore.setState({ current: null });
});

test("a pending delete hides its entries and what is inside them, nothing else", () => {
  usePendingDeleteStore.getState().show({ handle: 7, removed: ["courses/X/Exam", "a.pdf"] });
  expect(isPendingDelete("courses/X/Exam")).toBe(true);
  expect(isPendingDelete("courses/X/Exam/past.pdf")).toBe(true);
  expect(isPendingDelete("courses/X/Exam prep/past.pdf")).toBe(false);
  expect(isPendingDelete("a.pdf")).toBe(true);
  expect(withinRemoved("b.pdf", ["a.pdf"])).toBe(false);
});

test("the toast closing makes the delete final by its handle; Undo takes it back", async () => {
  const store = usePendingDeleteStore.getState();
  store.show({ handle: 7, removed: ["a.pdf"] });
  usePendingDeleteStore.getState().close();
  expect(calls).toEqual([["drive_delete_finish", { handle: 7 }]]);
  expect(isPendingDelete("a.pdf")).toBe(false);

  store.show({ handle: 8, removed: ["Exam"] });
  await usePendingDeleteStore.getState().undo();
  expect(calls.at(-1)).toEqual(["drive_delete_undo", { handle: 8 }]);
  expect(usePendingDeleteStore.getState().current).toBeNull();
});

test("a delete with no way back calls nothing when its toast closes", () => {
  usePendingDeleteStore.getState().show({ handle: null, removed: ["a.pdf"] });
  usePendingDeleteStore.getState().close();
  expect(calls).toEqual([]);
});

test("a newer delete replaces the toast with a toast of its own", () => {
  const store = usePendingDeleteStore.getState();
  store.show({ handle: 1, removed: ["a.pdf"] });
  const first = usePendingDeleteStore.getState().current?.key;
  store.show({ handle: 2, removed: ["b.pdf"] });
  expect(usePendingDeleteStore.getState().current?.key).not.toBe(first);
  expect(isPendingDelete("a.pdf")).toBe(false);
});
