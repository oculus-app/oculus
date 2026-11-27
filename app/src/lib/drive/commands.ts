import { invoke } from "@tauri-apps/api/core";

/**
 * Drive's folder commands (`create_folder`, `rename_entry`, `move_entries`,
 * `delete_entries` with its `drive_delete_finish` and `drive_delete_undo`,
 * `copy_to_own`). Rust refuses anything
 * outside the student's own files; every refusal arrives as a JSON-serialised
 * {@link DriveError}, which {@link driveErrorText} words for the screen.
 * Paths are data-dir-relative (`courses/<code>/…`).
 */

export type DriveErrorKind = "read_only" | "exists" | "not_found" | "invalid_name" | "io";

const KINDS: ReadonlySet<string> = new Set<DriveErrorKind>(["read_only", "exists", "not_found", "invalid_name", "io"]);

export interface DriveError {
  /** Null when the error was not one of the commands' typed errors. */
  kind: DriveErrorKind | null;
  message: string;
}

/** The typed error a command rejected with, or the raw text as `message`. */
export function parseDriveError(error: unknown): DriveError {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  if (error && typeof error === "object" && !(error instanceof Error)) {
    const typed = typedError(error);
    if (typed) return typed;
  }
  try {
    const typed = typedError(JSON.parse(raw));
    if (typed) return typed;
  } catch { /* Not JSON: the raw text is the message. */ }
  return { kind: null, message: raw };
}

function typedError(value: unknown): DriveError | null {
  if (!value || typeof value !== "object") return null;
  const { kind, message } = value as { kind?: unknown; message?: unknown };
  if (typeof kind !== "string" || !KINDS.has(kind)) return null;
  return { kind: kind as DriveErrorKind, message: typeof message === "string" ? message : "" };
}

export const READ_ONLY_TEXT = "Course files are read-only";

/** What the screen says for a failed command. */
export function driveErrorText(error: unknown): string {
  const { kind, message } = parseDriveError(error);
  if (kind === "read_only") return READ_ONLY_TEXT;
  return message || "Something went wrong";
}

/** A new, empty folder at `rel`; returns its path (a taken name is an
 *  `exists` error, never renamed). */
export const createFolder = (rel: string) => invoke<string>("create_folder", { rel });

/** Renames a file or folder in place; returns its new path. */
export const renameEntry = (rel: string, newName: string) =>
  invoke<string>("rename_entry", { rel, newName });

/** Moves files and folders into `targetDir`; returns their new paths in the
 *  same order. Rows keep their ids, so parses and versions stay. */
export const moveEntries = (rels: string[], targetDir: string) =>
  invoke<string[]>("move_entries", { rels, targetDir });

/** A delete sent to the system Trash (`Sent` in Rust). */
export interface SentDelete {
  /** What Undo and the toast's closing name; null when the delete was final
   *  at once (Windows says nothing of where the Recycle Bin put it). */
  handle: number | null;
  /** The entries' paths. */
  removed: string[];
  /** What the toast counts: each entry, and Studio's render as one. */
  count: number;
}

/** Moves files and folders to the system Trash. Their rows, parses and
 *  links stay until the delete is final (`finishDelete`), so `undoDelete`
 *  until then brings everything back. */
export const deleteEntries = (rels: string[]) => invoke<SentDelete>("delete_entries", { rels });

/** Makes a pending delete final: its rows and the app's records of it go. */
export const finishDelete = (handle: number) => invoke<void>("drive_delete_finish", { handle });

/** Moves a pending delete back out of the Trash; where each entry is now. */
export const undoDelete = (handle: number) => invoke<string[]>("drive_delete_undo", { handle });

/** Copies synced files or folders into the student's `targetDir`; returns the
 *  copies' paths in the same order. Each copy has its own row. */
export const copyToOwn = (rels: string[], targetDir: string) =>
  invoke<string[]>("copy_to_own", { rels, targetDir });
