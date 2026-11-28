import type { Download } from "./types";

/**
 * When a saved download's row may delete its file. Only a file the download
 * wrote itself: one whose bytes were already in the folder (`existed`) is the
 * student's earlier copy. Only by its `files` row id, never by the path,
 * which another file may hold since.
 */
export function mayDelete(d: Download, row: number | undefined): boolean {
  const saved = d.state === "saved" ? d.saved_to : null;
  return saved?.kind === "drive" && saved.outcome.file != null && !saved.outcome.existed && row != null;
}

/** Whether the file on disk at a row's path is still the one the row holds:
 *  listed in its folder with the row's size. A file deleted in Finder and
 *  replaced under the same name is another file. */
export function stillRowFile(
  row: { relative_path: string; size_bytes: number | null },
  listed: readonly { relativePath: string; size: number }[],
): boolean {
  const entry = listed.find((f) => f.relativePath === row.relative_path);
  return entry != null && row.size_bytes != null && entry.size === row.size_bytes;
}
