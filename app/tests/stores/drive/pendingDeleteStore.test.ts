import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseHTML } from "linkedom";

const calls: Array<[string, unknown]> = [];
let undoAnswer: () => Promise<unknown> = async () => ["Exam"];
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: unknown) => {
    calls.push([cmd, args]);
    return cmd === "drive_delete_undo" ? undoAnswer() : undefined;
  },
  transformCallback: () => 0,
}));
afterAll(() => {
  // Module mocks outlive the file; leave later files an invoke that fails as it does without Tauri.
  mock.module("@tauri-apps/api/core", () => ({
    invoke: async () => {
      throw new Error("Tauri is not available");
    },
    transformCallback: () => 0,
  }));
});

const { isPendingDelete, usePendingDeleteStore, withinRemoved } = await import("@/stores/drive/pendingDeleteStore");
const { MAX_LIFE_MS, undoReaches } = await import("@/components/drive/toast/DeleteToast");

const store = () => usePendingDeleteStore.getState();
const sent = (handle: number | null, removed: string[]) => ({ handle, removed, count: removed.length });
const refusal = (kind: string, message: string) => JSON.stringify({ kind, message });

beforeEach(() => {
  calls.length = 0;
  undoAnswer = async () => ["Exam"];
  usePendingDeleteStore.setState({ current: null });
});

test("a pending delete hides its entries and what is inside them, nothing else", () => {
  store().show(sent(7, ["courses/X/Exam", "a.pdf"]));
  expect(isPendingDelete("courses/X/Exam")).toBe(true);
  expect(isPendingDelete("courses/X/Exam/past.pdf")).toBe(true);
  expect(isPendingDelete("courses/X/Exam prep/past.pdf")).toBe(false);
  expect(isPendingDelete("a.pdf")).toBe(true);
  expect(withinRemoved("b.pdf", ["a.pdf"])).toBe(false);
});

test("the toast closing makes the delete final by its handle; Undo takes it back", async () => {
  let finals = 0;
  store().show(sent(7, ["a.pdf"]), { onFinal: () => (finals += 1) });
  store().close();
  expect(calls).toEqual([["drive_delete_finish", { handle: 7 }]]);
  await Promise.resolve();
  await Promise.resolve();
  expect(finals).toBe(1);

  store().show(sent(8, ["Exam"]), { onFinal: () => (finals += 1) });
  await store().undo();
  expect(calls.at(-1)).toEqual(["drive_delete_undo", { handle: 8 }]);
  expect(store().current).toBeNull();
  store().finalized(8);
  expect(finals).toBe(1, "an undone delete is never final");
});

test("Rust's word that a delete is final closes its toast and takes Undo away", () => {
  let finals = 0;
  store().show(sent(3, ["a.pdf"]), { download: 12, onFinal: () => (finals += 1) });
  store().finalized(99);
  expect(store().current?.handle).toBe(3);
  store().finalized(3);
  expect(store().current).toBeNull();
  expect(finals).toBe(1);
  expect(isPendingDelete("a.pdf")).toBe(false);
});

test("an Undo for a delete already final says so in the toast, with no Undo after", async () => {
  undoAnswer = async () => {
    throw refusal("not_found", "That delete is final now: it is in the Trash");
  };
  store().show(sent(4, ["a.pdf"]));
  await store().undo();
  expect(store().current).toMatchObject({ final: true, error: "That delete is final now: it is in the Trash" });
  store().close();
  expect(calls.filter(([cmd]) => cmd === "drive_delete_finish")).toEqual([]);
});

test("an Undo that fails otherwise keeps Undo on offer, with the reason", async () => {
  undoAnswer = async () => {
    throw refusal("io", "notes.md is being parsed right now; try again when it finishes");
  };
  store().show(sent(5, ["notes.md"]));
  await store().undo();
  expect(store().current).toMatchObject({ handle: 5, final: false, undoing: false });
  expect(store().current?.error).toContain("being parsed");
  undoAnswer = async () => ["notes.md"];
  await store().undo();
  expect(store().current).toBeNull();
});

test("a delete with no way back runs its final work at once and offers no Undo", () => {
  let finals = 0;
  store().show(sent(null, ["a.pdf"]), { onFinal: () => (finals += 1) });
  expect(finals).toBe(1);
  expect(store().current?.final).toBe(true);
  store().close();
  expect(calls).toEqual([]);
});

test("a newer delete replaces the toast with a toast of its own", () => {
  store().show(sent(1, ["a.pdf"]));
  const first = store().current?.key;
  store().show(sent(2, ["b.pdf"]));
  expect(store().current?.key).not.toBe(first);
  expect(isPendingDelete("a.pdf")).toBe(false);
});

test("⌘Z is the delete's only where it was made, never in a field or an editor", () => {
  const dom = parseHTML("<!doctype html><html><body></body></html>");
  const saved = { document: globalThis.document, Element: globalThis.Element };
  Object.assign(globalThis, { document: dom.document, Element: dom.window.Element });
  const document = dom.document;
  const drive = document.createElement("div");
  drive.setAttribute("data-undo-delete", "");
  const button = document.createElement("button");
  const field = document.createElement("input");
  const editor = document.createElement("div");
  editor.className = "cm-editor";
  const inEditor = document.createElement("div");
  editor.append(inEditor);
  drive.append(button, field, editor);
  const elsewhere = document.createElement("div");
  document.body.append(drive, elsewhere);
  expect(undoReaches(document.body)).toBe(true);
  expect(undoReaches(button)).toBe(true);
  expect(undoReaches(field)).toBe(false);
  expect(undoReaches(inEditor)).toBe(false);
  expect(undoReaches(elsewhere)).toBe(false);
  drive.remove();
  elsewhere.remove();
  Object.assign(globalThis, saved);
});

test("the toast never outlives Rust's backstop", () => {
  const rust = readFileSync(join(import.meta.dir, "../../../src-tauri/src/library/drive/ops/delete/commands.rs"), "utf8");
  const backstop = Number(/UNATTENDED: Duration = Duration::from_secs\((\d+)\)/.exec(rust)?.[1]) * 1000;
  expect(backstop).toBeGreaterThan(0);
  expect(MAX_LIFE_MS).toBeLessThanOrEqual(backstop / 2);
});
