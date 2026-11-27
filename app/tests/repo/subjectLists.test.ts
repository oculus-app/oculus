import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// `subjects` holds one reserved row that is no subject: the row top-level
// Drive files hang off (docs/architecture.md, "The database has one schema
// owner and two writers"). Every list of subjects must leave it out. What
// this checks: a `FROM subjects` (a read of the table itself) appears only
// in the files below, and there, within the rest of its statement, either
// filters `kind = 'subject'` (or names the reserved row, `kind = 'top'`) or
// is one of the file's listed reads of one row by id. A `JOIN subjects` is
// not checked: it reads the subject of a file, lecture or thread by its id,
// and a top-level file's is the reserved row, as it should be.

const APP = join(import.meta.dir, "../..");
const ROOTS = ["src", "src-tauri/src"];

/** Files that may read `subjects`, with how many of their reads name one row
 *  by id and so need no `kind` filter. */
const ALLOWED = new Map<string, number>([
  // `getSubjects`, the frontend's one list.
  ["src/lib/db/subjects.ts", 0],
  // `subjects()`, the term-sort backfill, and the reserved row's own lookup.
  ["src-tauri/src/db/store/subjects.rs", 0],
  // A code resolved against the subjects, and one row's code by id.
  ["src-tauri/src/db/proposals/inspect.rs", 1],
  // Drive's folder-to-subject lookup.
  ["src-tauri/src/library/drive/ops/rows.rs", 0],
  // Onboarding's "is there a library yet".
  ["src-tauri/src/sources/institution/configure.rs", 0],
]);

const READ = /\bFROM\s+subjects\b/gi;
/** A filter that keeps the reserved row out, or reads only it. */
const KIND = /\bkind\s*=\s*'(subject|top)'/;
/** How far past a read its `kind` filter may sit: the rest of its statement. */
const REACH = 200;

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "tests" || entry.name === "fixtures") continue;
      yield* sources(path);
    } else if (/\.(rs|ts|tsx)$/.test(entry.name) && !/(^tests|_tests|\.test)\.(rs|ts|tsx)$/.test(entry.name)) {
      yield path;
    }
  }
}

/** A file's code: a Rust file's inline tests (after its `#[cfg(test)]`) left out. */
function code(path: string): string {
  const text = readFileSync(path, "utf8");
  if (!path.endsWith(".rs")) return text;
  const end = text.search(/^\s*#\[cfg\(test\)\]\s*$/m);
  return end === -1 ? text : text.slice(0, end);
}

test("every read of the subjects table leaves the reserved top-level row out", () => {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const root of ROOTS) {
    for (const path of sources(join(APP, root))) {
      const rel = relative(APP, path).split(sep).join("/");
      // Applied migrations are frozen, and ran before the row existed.
      if (rel === "src-tauri/src/db/migrations.rs") continue;
      const text = code(path);
      let unfiltered = 0;
      for (const hit of text.matchAll(READ)) {
        const line = text.slice(0, hit.index).split("\n").length;
        // Prose that happens to say "from subjects".
        if (/^\s*(\/\/|\/?\*)/.test(text.split("\n")[line - 1])) continue;
        if (!ALLOWED.has(rel)) {
          problems.push(`${rel}:${line} reads subjects; use getSubjects / store::subjects, or list the file here`);
          continue;
        }
        if (!KIND.test(text.slice(hit.index, hit.index + REACH))) unfiltered += 1;
      }
      if (ALLOWED.has(rel)) seen.set(rel, unfiltered);
    }
  }
  for (const [rel, byId] of ALLOWED) {
    const found = seen.get(rel);
    if (found === undefined) problems.push(`${rel} is listed but was not scanned`);
    else if (found !== byId) problems.push(`${rel} has ${found} read(s) of subjects with no kind filter, expected ${byId}`);
  }
  expect(problems).toEqual([]);
});
