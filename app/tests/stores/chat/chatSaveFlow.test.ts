import { afterAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import * as db from "@/lib/db";
import { TOP_LEVEL } from "@/lib/files/libraryLayout";

// A save end to end with Rust's copy stood in: the picker's answer is the
// folder Rust is asked for, and the copy's row lands on that folder's home.
const SVG = ".oculus/agents/outputs/dfa-even-zeros.svg";
const STAMP = { size: 6, modifiedMs: 1000 };
const SUBJECT = { id: 3, code: "COMP30026_2026_SM2" } as db.Subject;

let copied: Record<string, unknown> | null = null;
let landed = "";
mock.module("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args: Record<string, unknown>) => {
    if (command !== "drive_save_copy") throw new Error("Tauri is not available");
    copied = args;
    const file = { filename: landed.slice(landed.lastIndexOf("/") + 1), relative_path: landed, file_type: "svg", size_bytes: 6, category: "upload" };
    return { outcome: { source: landed, file, error: null }, stamp: STAMP };
  },
}));

const rows: { subject: number; path: string }[] = [];
const remembered: [string, number][] = [];
const spies = [
  spyOn(db, "getSubjects").mockResolvedValue([SUBJECT]),
  spyOn(db, "upsertFile").mockImplementation(async (subject: number, _name: string, path: string) => {
    rows.push({ subject, path });
    return 0;
  }),
  spyOn(db, "getFileByRelativePath").mockImplementation(async (path: string) => ({ id: 42, relative_path: path }) as db.DbFile),
  spyOn(db, "rememberChatSave").mockImplementation(async (source: string, fileId: number) => {
    remembered.push([source, fileId]);
  }),
];
const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
globals.window ??= new EventTarget();
afterAll(() => {
  for (const spy of spies) spy.mockRestore();
  if (!hadWindow) delete globals.window;
});

const { useChatSaves } = await import("@/stores/chat/chatSaveStore");
const { useDrivePicker } = await import("@/stores/shell/drivePickerStore");

/** The picker's request once the save has asked, answered with `pick`. */
async function answer(pick: { targetDir: string; name: string }) {
  while (!useDrivePicker.getState().pending) await Bun.sleep(1);
  const request = useDrivePicker.getState().pending!.request;
  useDrivePicker.getState().settle(request, pick);
  return request;
}

beforeEach(() => {
  rows.length = 0;
  remembered.length = 0;
  copied = null;
  useChatSaves.setState({ states: { [SVG]: { stamp: STAMP, saved: null } } });
});

test("a chat with no subject starts at the top level, and a copy there hangs off the top-level row", async () => {
  landed = "even.svg";
  const saving = useChatSaves.getState().save(SVG, null);
  const request = await answer({ targetDir: "", name: "even.svg" });
  await saving;
  expect(request.start).toBe("");
  expect(request.name).toBe("dfa-even-zeros.svg");
  expect(copied).toEqual({ source: SVG, targetDir: "", name: "even.svg" });
  expect(rows).toEqual([{ subject: TOP_LEVEL.id, path: "even.svg" }]);
  expect(remembered).toEqual([[SVG, 42]]);
  expect(useChatSaves.getState().states[SVG]).toEqual({ stamp: STAMP, saved: { fileId: 42, relativePath: "even.svg" } });
});

test("a subject's chat starts in its folder, and a copy in a folder of the student's there hangs off the subject", async () => {
  landed = "courses/COMP30026_2026_SM2/Diagrams/dfa-even-zeros.svg";
  const saving = useChatSaves.getState().save(SVG, SUBJECT.id);
  const request = await answer({ targetDir: "courses/COMP30026_2026_SM2/Diagrams", name: "dfa-even-zeros.svg" });
  await saving;
  expect(request.start).toBe("courses/COMP30026_2026_SM2");
  expect(rows).toEqual([{ subject: SUBJECT.id, path: landed }]);
});
