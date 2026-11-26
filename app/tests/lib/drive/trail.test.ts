import { expect, test } from "bun:test";
import { driveTrail } from "@/lib/drive/trail";
import { COURSES_DIR } from "@/lib/files/libraryLayout";
import type { Subject } from "@/lib/db";

const subjects = [{ code: "MULT20015_2026_SM2" }, { code: "CS 101" }] as Subject[];
const inSubject = `${COURSES_DIR}/MULT20015_2026_SM2/Labs/Week 6`;
const shape = (rel: string, from?: "drive" | "subject") =>
  driveTrail(rel, subjects, from).map((part) => `${part.kind}:${part.label}`);

test("the whole path runs from My Drive through Subjects to the folder", () => {
  expect(shape(inSubject)).toEqual([
    "drive:My Drive", "subjects:Subjects", "subject:MULT20015", "folder:Labs", "folder:Week 6",
  ]);
  expect(driveTrail(inSubject, subjects).map((part) => part.rel)).toEqual([
    "", COURSES_DIR, `${COURSES_DIR}/MULT20015_2026_SM2`,
    `${COURSES_DIR}/MULT20015_2026_SM2/Labs`, inSubject,
  ]);
});

test("the short form starts at the subject", () => {
  expect(shape(inSubject, "subject")).toEqual(["subject:MULT20015", "folder:Labs", "folder:Week 6"]);
  expect(shape(`${COURSES_DIR}/CS_101`, "subject")).toEqual(["subject:CS 101"]);
});

test("a subject keeps its code for its icon", () => {
  const subject = driveTrail(inSubject, subjects, "subject")[0];
  expect(subject).toEqual({
    kind: "subject", rel: `${COURSES_DIR}/MULT20015_2026_SM2`, label: "MULT20015", code: "MULT20015_2026_SM2",
  });
});

test("a path outside every subject starts at My Drive in both forms", () => {
  expect(shape("")).toEqual(["drive:My Drive"]);
  expect(shape("Videos/Exports", "subject")).toEqual(["drive:My Drive", "folder:Videos", "folder:Exports"]);
  expect(shape(COURSES_DIR, "subject")).toEqual(["drive:My Drive", "subjects:Subjects"]);
  expect(shape(`${COURSES_DIR}/MAST20009_2025_SM1/Notes`, "subject")).toEqual([
    "drive:My Drive", "subjects:Subjects", "folder:MAST20009_2025_SM1", "folder:Notes",
  ]);
});

test("a top-level entry is never read as a subject", () => {
  expect(shape("MULT20015_2026_SM2/Labs")).toEqual([
    "drive:My Drive", "folder:MULT20015_2026_SM2", "folder:Labs",
  ]);
  expect(shape(`Archive/${COURSES_DIR}/MULT20015_2026_SM2`)).toEqual([
    "drive:My Drive", "folder:Archive", `folder:${COURSES_DIR}`, "folder:MULT20015_2026_SM2",
  ]);
  expect(shape(`${COURSES_DIR}/Old/MULT20015_2026_SM2`)).toEqual([
    "drive:My Drive", "subjects:Subjects", "folder:Old", "folder:MULT20015_2026_SM2",
  ]);
});
