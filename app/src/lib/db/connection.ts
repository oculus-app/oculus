import Database from "@tauri-apps/plugin-sql";
import { DB_PATH } from "@/lib/files/statePaths";

let _db: Promise<Database> | null = null;

/** `DB_URL` in `app/src-tauri/src/library/paths/db.rs`: the plugin keys the
 *  migrations by this string, so the two are spelled alike
 *  (`app/tests/repo/dbUrl.test.ts`). */
export const DB_URL = `sqlite:${DB_PATH}`;

export function getDb(): Promise<Database> {
  // Share initialization across the shell, restored panes and StrictMode mounts.
  // A failed load leaves the next call free to retry, except a failed
  // migration: the plugin hands over its migrations to the first load only,
  // so a retry would open the database without them and hide the error.
  return _db ??= Database.load(DB_URL).catch((error) => {
    if (!/migration/i.test(String(error))) _db = null;
    throw error;
  });
}
