import { describe, expect, test } from "bun:test";
import { createSavedRecorder } from "@/lib/browser/downloads/recordSaved";
import type { Download } from "@/lib/browser/downloads/types";
import type { ImportOutcome } from "@/lib/files/uploads";
import { download } from "./fixtures";

const SUBJECT = { id: 42, code: "COMP10001_2026_SM2" };

function outcome(filename: string, error: string | null = null): ImportOutcome {
  return {
    source: filename,
    file: { filename, relative_path: `courses/${SUBJECT.code}/${filename}`, file_type: "x", size_bytes: 10 },
    error,
  };
}

const TOP = { id: -100, code: "My Drive" };

function saved(id: number, o: ImportOutcome): Download {
  return download(id, { state: "saved", saved_to: { kind: "drive", outcome: o } });
}

/** A recorder over an in-memory files table, logging what it writes and
 *  which row each download was told. */
function harness(existing: string[] = []) {
  const rows = new Map(existing.map((path, i) => [path, 1000 + i]));
  const written: string[] = [];
  const homes: string[] = [];
  const told: Record<number, number> = {};
  let failNext = false;
  const record = createSavedRecorder({
    homeOf: async (path) => (path.startsWith(`courses/${SUBJECT.code}/`) ? SUBJECT : path.startsWith("courses/") ? null : TOP),
    rowAt: async (path) => rows.get(path) ?? null,
    record: async (home, outcomes) => {
      if (failNext) {
        failNext = false;
        throw new Error("database is locked");
      }
      for (const o of outcomes) {
        rows.set(o.file!.relative_path, rows.size + 1);
        written.push(o.file!.filename);
        homes.push(home.code);
      }
    },
    onRow: (download, file) => { told[download] = file; },
  });
  return { record, written, homes, told, failOnce: () => { failNext = true; } };
}

describe("recording downloads saved to Drive", () => {
  test("each saved download is recorded once, however often the list repeats", async () => {
    const { record, written } = harness();
    const list = [saved(1, outcome("a.pdf"))];
    await Promise.all([record(list), record(list)]);
    await record(list);
    expect(written).toEqual(["a.pdf"]);
  });

  test("a list replayed after a reload records nothing already in the database", async () => {
    const { record, written, told } = harness([`courses/${SUBJECT.code}/a.pdf`]);
    await record([saved(1, outcome("a.pdf")), saved(2, outcome("b.pdf"))]);
    expect(written).toEqual(["b.pdf"]);
    expect(told).toEqual({ 1: 1000, 2: 2 });
  });

  test("the row hangs off the subject its path is in, or the top level", async () => {
    const { record, homes } = harness();
    const top: ImportOutcome = { source: "kit.pdf", file: { filename: "kit.pdf", relative_path: "Receipts/kit.pdf", file_type: "pdf", size_bytes: 1 }, error: null };
    await record([saved(1, outcome("a.pdf")), saved(2, top)]);
    expect(homes.sort()).toEqual([SUBJECT.code, "My Drive"].sort());
  });

  test("a path no known subject holds is not recorded, and is tried again", async () => {
    const { record, written } = harness();
    const stray: ImportOutcome = { source: "x.pdf", file: { filename: "x.pdf", relative_path: "courses/GONE/x.pdf", file_type: "pdf", size_bytes: 1 }, error: null };
    await record([saved(1, stray)]);
    expect(written).toEqual([]);
  });

  test("a file whose conversion failed is still recorded; the parse is left to recordUploads", async () => {
    const { record, written } = harness();
    await record([saved(1, outcome("notes.docx", "added, but not converted for search"))]);
    expect(written).toEqual(["notes.docx"]);
  });

  test("rows that are not saved to Drive are left alone", async () => {
    const { record, written } = harness();
    await record([
      download(1),
      download(2, { state: "ready" }),
      download(3, { state: "saved", saved_to: { kind: "path", path: "/Users/s/Downloads/c.zip" } }),
      download(4, { state: "failed", error: "x" }),
    ]);
    expect(written).toEqual([]);
  });

  test("a failed write is tried again on the next list", async () => {
    const { record, written, failOnce } = harness();
    const list = [saved(1, outcome("a.pdf"))];
    failOnce();
    await record(list);
    expect(written).toEqual([]);
    await record(list);
    expect(written).toEqual(["a.pdf"]);
  });
});
