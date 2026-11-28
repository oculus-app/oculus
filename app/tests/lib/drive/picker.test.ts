import { expect, test } from "bun:test";
import type { Subject } from "@/lib/db";
import type { FolderEntry, FolderListing } from "@/lib/drive/listing";
import { isPickerPlace, pendingStart, pickerFolders, settleStart } from "@/lib/drive/picker";

const subject = (id: number, code: string, current = true) => ({ id, code, name: code, is_current: current }) as Subject;
const subjects = [subject(1, "COMP30026_2026_SM2"), subject(2, "MAST20009_2025_SM1", false)];

const folder = (relativePath: string, writable = true): FolderEntry => ({
  relativePath, name: relativePath.slice(relativePath.lastIndexOf("/") + 1), zone: writable ? "own" : "synced",
  writable, editable: writable, childCount: 0, modified: null,
});
const listing = (rel: string, writable: boolean, folders: FolderEntry[] = []): FolderListing => ({
  rel, zone: writable ? "own" : "synced", writable, folders, files: [], recordings: [],
});

/** A disk of listings by path; a path it lacks is a folder that is gone. */
const disk = (...listings: FolderListing[]) => {
  const asked: string[] = [];
  const list = async (rel: string) => {
    asked.push(rel);
    const found = listings.find((l) => l.rel === rel);
    if (!found) throw new Error(`${rel} not found`);
    return found;
  };
  return { list, asked };
};

test("a start that exists and takes files is where the picker opens", async () => {
  const { list, asked } = disk(listing("Videos/2026", true));
  expect((await settleStart("Videos/2026", list)).rel).toBe("Videos/2026");
  expect(asked).toEqual(["Videos/2026"]);
});

test("a start that is gone falls back to the nearest folder above it", async () => {
  const { list, asked } = disk(listing("", true), listing("Videos", true));
  expect((await settleStart("Videos/2026/Drafts", list)).rel).toBe("Videos");
  expect(asked).toEqual(["Videos/2026/Drafts", "Videos/2026", "Videos"]);
  expect((await settleStart("Gone/Deeper", list)).rel).toBe("");
});

test("a synced folder is never a place: the picker opens on the subject above it", async () => {
  const root = "courses/COMP30026_2026_SM2";
  const { list } = disk(listing(root, true), listing(`${root}/Course`, false), listing(`${root}/Course/Files`, false));
  expect((await settleStart(`${root}/Course/Files`, list)).rel).toBe(root);
});

test("the folder of subjects is a place to stand in, though nothing lands there", async () => {
  const { list } = disk(listing("", true), listing("courses", false));
  expect((await settleStart("courses", list)).rel).toBe("courses");
  expect(isPickerPlace(listing("courses", false))).toBe(true);
  expect(isPickerPlace(listing("courses/X/Course", false))).toBe(false);
});

test("a library that can't be read at all rejects", async () => {
  const { list } = disk();
  await expect(settleStart("Videos", list)).rejects.toThrow();
});

test("the top level lists Subjects and the student's folders", () => {
  const top = listing("", true, [folder("courses", false), folder("Receipts"), folder("Videos")]);
  expect(pickerFolders(top, subjects)).toEqual({
    current: [
      { rel: "courses", label: "Subjects", subjects: true },
      { rel: "Receipts", label: "Receipts" },
      { rel: "Videos", label: "Videos" },
    ],
    past: [],
  });
});

test("a subject lists its own folders and never Course", () => {
  const root = "courses/COMP30026_2026_SM2";
  const inside = listing(root, true, [folder(`${root}/Course`, false), folder(`${root}/Labs`)]);
  expect(pickerFolders(inside, subjects).current).toEqual([{ rel: `${root}/Labs`, label: "Labs" }]);
});

test("Subjects lists the subjects Oculus knows by code, the past ones apart", () => {
  const all = listing("courses", false, [
    folder("courses/COMP30026_2026_SM2"), folder("courses/MAST20009_2025_SM1"), folder("courses/Stray"),
  ]);
  const { current, past } = pickerFolders(all, subjects);
  expect(current.map((f) => [f.rel, f.label, f.subject?.id])).toEqual([["courses/COMP30026_2026_SM2", "COMP30026", 1]]);
  expect(past.map((f) => [f.rel, f.label, f.subject?.id])).toEqual([["courses/MAST20009_2025_SM1", "MAST20009", 2]]);
});

test("a missing start the caller would have made opens as the destination still to make", () => {
  const subjectRoot = listing("courses/COMP30026_2026_SM2", true, [folder("courses/COMP30026_2026_SM2/Exam prep")]);
  const ask = { start: "courses/COMP30026_2026_SM2/Videos", makeStart: true };
  expect(pendingStart(ask, subjectRoot)).toBe("courses/COMP30026_2026_SM2/Videos");
  // Only when asked, only from the folder that would hold it, and only while it is missing.
  expect(pendingStart({ ...ask, makeStart: false }, subjectRoot)).toBeNull();
  expect(pendingStart(ask, listing("courses", false))).toBeNull();
  expect(pendingStart(ask, listing("", true))).toBeNull();
  const made = listing("courses/COMP30026_2026_SM2", true, [folder("courses/COMP30026_2026_SM2/videos")]);
  expect(pendingStart(ask, made)).toBeNull();
  expect(pendingStart({ start: "Videos", makeStart: true }, listing("", true))).toBe("Videos");
  expect(pendingStart(ask, null)).toBeNull();
});
