import { expect, test } from "bun:test";
import { Folder, FolderSimple } from "@phosphor-icons/react";
import { driveCrumbs } from "@/components/drive/header/crumbs";
import { driveFolderHref, filesFolderHref } from "@/lib/drive/routes";
import type { Subject } from "@/lib/db";

const subjects: Subject[] = [{
  id: 1, code: "COMP30026_2026_SM2", name: "Models", term_name: null, term_sort: null, is_current: true,
  workflow_state: "available", selected: true, last_synced_at: null, created_at: "",
}];

const trail = (folder: string, locked = false) =>
  driveCrumbs({ root: "", folder, rootLabel: "My Drive", rootIcon: Folder, subjects, folderHref: driveFolderHref, locked })
    .map((c) => [c.label, c.href]);

test("Drive's trail names the folder of subjects and a subject, and a top-level folder as it is", () => {
  expect(trail("")).toEqual([["My Drive", undefined]]);
  expect(trail("courses")).toEqual([["My Drive", "/drive"], ["Subjects", undefined]]);
  expect(trail("courses/COMP30026_2026_SM2/Course/Files")).toEqual([
    ["My Drive", "/drive"],
    ["Subjects", "/drive/courses"],
    ["COMP30026", "/drive/courses/COMP30026_2026_SM2"],
    ["Course", "/drive/courses/COMP30026_2026_SM2/Course"],
    ["Files", undefined],
  ]);
  // A top-level folder is never read as a subject, whatever its name.
  expect(trail("COMP30026_2026_SM2/Raw")).toEqual([
    ["My Drive", "/drive"],
    ["COMP30026_2026_SM2", "/drive/COMP30026_2026_SM2"],
    ["Raw", undefined],
  ]);
});

test("a subject's Files tab keeps its own trail", () => {
  const root = "courses/COMP30026_2026_SM2";
  const href = (rel: string) => filesFolderHref(1, rel === root ? "" : rel.slice(root.length + 1));
  const items = driveCrumbs({
    root, folder: `${root}/Notes/Week 1`, rootLabel: "Files", rootIcon: FolderSimple, subjects, folderHref: href, locked: false,
  });
  expect(items.map((c) => [c.label, c.href])).toEqual([
    ["Files", "/subjects/1/files"],
    ["Notes", "/subjects/1/files/Notes"],
    ["Week 1", undefined],
  ]);
});
