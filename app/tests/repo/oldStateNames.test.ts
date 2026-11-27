import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OLD_STATE_NAMES, stateRel } from "@/lib/files/statePaths";

// Drive refuses the old app folder names to new top-level entries because
// the frontend reads a cited path under one as the app's; the state move
// records path moves for the ones chats cite. Three lists, one set of names.

const SRC = join(import.meta.dir, "../../src-tauri/src");

/** A Rust `[&str; N]` constant's names. */
function rustNames(file: string, constant: string): string[] {
  const text = readFileSync(join(SRC, file), "utf8");
  const body = new RegExp(`pub const ${constant}: \\[&str; \\d+\\] = \\[([^\\]]*)\\];`).exec(text)?.[1];
  expect(body).toBeDefined();
  return [...body!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("Drive refuses exactly the top-level names the frontend reads as the app's", () => {
  expect(rustNames("library/layout/zone.rs", "OLD_STATE_NAMES")).toEqual([...OLD_STATE_NAMES]);
});

test("every folder the state move records for old chats is one of them", () => {
  const cited = rustNames("library/migrate/state/names.rs", "CITED");
  expect(cited.length).toBeGreaterThan(0);
  for (const name of cited) {
    expect(OLD_STATE_NAMES).toContain(name);
    expect(stateRel(`${name}/x`)).toBe(`.oculus/${name}/x`);
  }
});
