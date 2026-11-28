import { expect, test } from "bun:test";
import fixture from "../../fixtures/library/top_level.json";
import { categoryOfPath, isOwnPath, isTopLevelPath, pagesRecordOf, TOP_LEVEL } from "@/lib/files/libraryLayout";

// The same cases Rust's layout is held to (`library/layout/tests/top_level.rs`).

test("the reserved row is the one Rust and migration 68 name", () => {
  expect(TOP_LEVEL.id).toBe(fixture.id);
  expect(TOP_LEVEL.code).toBe(fixture.code);
  // Callers test `if (!subjectId)`.
  expect(TOP_LEVEL.id).not.toBe(0);
});

test("the top level is the student's but for dot-names and the folder of subjects", () => {
  for (const path of fixture.own) {
    expect(isTopLevelPath(path), path).toBe(true);
    expect(isOwnPath(path), path).toBe(true);
  }
  for (const path of fixture.not_own) {
    expect(isTopLevelPath(path), path).toBe(false);
    expect(isOwnPath(path), path).toBe(false);
  }
});

test("a top-level file's category is its extension's", () => {
  for (const [path, category] of fixture.categories) expect(categoryOfPath(path), path).toBe(category);
});

test("a top-level PDF's parse record sits under the top level's .oculus/derived", () => {
  for (const [pdf, record] of fixture.records) {
    expect(pagesRecordOf(pdf.replace(/\.pdf$/, ".md")), pdf).toBe(record);
  }
});
