import { afterAll, expect, test } from "bun:test";
import { Database as SQLite } from "bun:sqlite";
import { UNPARSED_FILES_SQL } from "@/lib/db/pipeline";

// The parse sweep's statement against an in-memory SQLite: the top level's
// reserved row is never selected, and its files must still be swept.
const sqlite = new SQLite(":memory:");
sqlite.exec(`CREATE TABLE subjects (id INTEGER PRIMARY KEY, code TEXT, selected INTEGER, kind TEXT);
  CREATE TABLE files (id INTEGER PRIMARY KEY, subject_id INTEGER, relative_path TEXT, file_type TEXT,
    parse_status TEXT, scraped_at TEXT);
  INSERT INTO subjects VALUES (-100, 'My Drive', 0, 'top'), (1, 'MAST20004', 1, 'subject'), (2, 'OLD10001', 0, 'subject');
  INSERT INTO files VALUES
    (1, -100, 'timetable.pdf', 'pdf', NULL, '2026-11-02'),
    (2, 1, 'courses/MAST20004/Course/Files/notes.pdf', 'pdf', 'error', '2026-11-01'),
    (3, 2, 'courses/OLD10001/Course/Files/old.pdf', 'pdf', NULL, '2026-11-03'),
    (4, -100, 'Receipts/done.pdf', 'pdf', 'quality', '2026-11-04'),
    (5, -100, 'notes.md', 'md', NULL, '2026-11-05');`);
afterAll(() => sqlite.close());

test("the sweep reaches the top level's files beside the selected subjects'", () => {
  const rows = sqlite.query(UNPARSED_FILES_SQL).all() as { relative_path: string; code: string }[];
  expect(rows.map((r) => [r.relative_path, r.code])).toEqual([
    ["timetable.pdf", "My Drive"],
    ["courses/MAST20004/Course/Files/notes.pdf", "MAST20004"],
  ]);
});
