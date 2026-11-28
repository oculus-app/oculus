import { describe, expect, test } from "bun:test";
import { mayDelete, stillRowFile } from "@/lib/browser/downloads/deletable";
import type { ImportOutcome } from "@/lib/files/uploads";
import { download } from "./fixtures";

const outcome = (existed: boolean): ImportOutcome => ({
  source: "order.pdf",
  file: { filename: "order.pdf", relative_path: "Receipts/order.pdf", file_type: "pdf", size_bytes: 10, category: "upload" },
  error: null,
  existed,
});
const saved = (o: ImportOutcome) => download(1, { state: "saved", saved_to: { kind: "drive", outcome: o } });

describe("mayDelete", () => {
  test("a file the download wrote, once its row is known", () => {
    expect(mayDelete(saved(outcome(false)), 7)).toBe(true);
  });

  test("never the student's own file the download's bytes matched", () => {
    expect(mayDelete(saved(outcome(true)), 7)).toBe(false);
  });

  test("never by the path before the row is known", () => {
    expect(mayDelete(saved(outcome(false)), undefined)).toBe(false);
  });

  test("never a download saved on the Mac or not saved", () => {
    expect(mayDelete(download(1, { state: "saved", saved_to: { kind: "path", path: "/tmp/a.pdf" } }), 7)).toBe(false);
    expect(mayDelete(download(1, { state: "discarded" }), 7)).toBe(false);
  });
});

describe("stillRowFile", () => {
  const row = { relative_path: "Receipts/order.pdf", size_bytes: 10 };

  test("the file listed at the row's path with the row's size", () => {
    expect(stillRowFile(row, [{ relativePath: "Receipts/order.pdf", size: 10 }])).toBe(true);
  });

  test("another file under the same name, or none, is not", () => {
    expect(stillRowFile(row, [{ relativePath: "Receipts/order.pdf", size: 11 }])).toBe(false);
    expect(stillRowFile(row, [])).toBe(false);
    expect(stillRowFile({ ...row, size_bytes: null }, [{ relativePath: "Receipts/order.pdf", size: 10 }])).toBe(false);
  });
});
