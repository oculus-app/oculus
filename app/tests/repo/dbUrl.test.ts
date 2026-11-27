import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DB_URL } from "@/lib/db/connection";

// `tauri-plugin-sql` keys the migrations Rust registers by the database's
// URL, and hands them to the first `Database.load` of that same string. A
// frontend that spells it differently opens a second, empty database.

const RUST = join(import.meta.dir, "../../src-tauri/src/library/paths/db.rs");

test("the frontend loads the database Rust registers migrations for", () => {
  const rust = /^pub const DB_URL: &str = "([^"]+)";$/m.exec(readFileSync(RUST, "utf8"))?.[1];
  expect(rust).toBeDefined();
  expect(DB_URL).toBe(rust!);
});
