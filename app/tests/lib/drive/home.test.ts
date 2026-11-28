import { expect, test } from "bun:test";
import type { FolderEntry } from "@/lib/drive/listing";
import type { Subject } from "@/lib/db";
import { homeOf, isSubjectsFolder } from "@/lib/drive/home";
import { folderItem, isFixedFolder, itemEditable } from "@/lib/drive/items";
import { TOP_LEVEL } from "@/lib/files/libraryLayout";

const subject = (id: number, code: string): Subject => ({
  id, code, name: `${code} name`, term_name: null, term_sort: null, is_current: true,
  workflow_state: "available", selected: true, last_synced_at: null, created_at: "",
});
const subjects = [subject(1, "COMP30026_2026_SM2"), subject(2, "CS 101")];

const folder = (relativePath: string, own: boolean): FolderEntry => ({
  relativePath, name: relativePath.split("/").pop()!, zone: own ? "own" : "synced",
  writable: relativePath !== "courses", editable: own, childCount: 2, modified: null,
});

test("a path's home is its subject, or the top level", () => {
  expect(homeOf("", subjects)).toBe(TOP_LEVEL);
  expect(homeOf("Videos/Raw", subjects)).toBe(TOP_LEVEL);
  expect(homeOf("courses/COMP30026_2026_SM2/Notes", subjects)?.id).toBe(1);
  // A code is found by the folder `safe_dir` made of it.
  expect(homeOf("courses/CS_101", subjects)?.id).toBe(2);
  // The folder of subjects is no one's, and neither is an unknown subject's folder or app state.
  expect(homeOf("courses", subjects)).toBeUndefined();
  expect(homeOf("courses/GONE1/a", subjects)).toBeUndefined();
  expect(homeOf(".oculus/agents", subjects)).toBeUndefined();
  expect(isSubjectsFolder("courses") && !isSubjectsFolder("courses/X") && !isSubjectsFolder("")).toBe(true);
});

test("the folder of subjects is Subjects, a subject its code, a top-level folder its own name", () => {
  const all = folderItem(folder("courses", false), subjects);
  expect(all).toMatchObject({ name: "Subjects", subjects: true });
  expect(all.type === "folder" && all.subject).toBeUndefined();

  const one = folderItem(folder("courses/COMP30026_2026_SM2", false), subjects);
  expect(one).toMatchObject({ name: "COMP30026" });
  expect(one.type === "folder" && one.subject?.id).toBe(1);

  // A top-level folder is never read as a subject, even one named as a subject's is.
  const mine = folderItem(folder("COMP30026_2026_SM2", true), subjects);
  expect(mine).toMatchObject({ name: "COMP30026_2026_SM2" });
  expect(mine.type === "folder" && (mine.subject ?? mine.subjects)).toBeUndefined();
  const deep = folderItem(folder("courses/COMP30026_2026_SM2/CS_101", true), subjects);
  expect(deep.name).toBe("CS_101");
});

test("only the student's folders are theirs to rename, move or delete", () => {
  const fixed = [folder("courses", false), folder("courses/COMP30026_2026_SM2", false), folder("courses/UNKNOWN1", false)];
  for (const entry of fixed) {
    const item = folderItem(entry, subjects);
    expect(isFixedFolder(item), entry.relativePath).toBe(true);
    expect(itemEditable(item), entry.relativePath).toBe(false);
  }
  for (const entry of [folder("Videos", true), folder("courses/COMP30026_2026_SM2/Notes", true)]) {
    const item = folderItem(entry, subjects);
    expect(isFixedFolder(item), entry.relativePath).toBe(false);
    expect(itemEditable(item), entry.relativePath).toBe(true);
  }
});
