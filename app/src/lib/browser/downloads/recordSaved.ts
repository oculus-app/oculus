import type { FileHome } from "@/lib/drive/home";
import type { ImportOutcome } from "@/lib/files/uploads";
import type { Download } from "./types";

/**
 * A download saved to Drive is an upload: the frontend writes its `files`
 * row, under the subject (or the top level) its path is in, and kicks the
 * parse, as for a picked file (`recordUploads`). Rows come again in every
 * event and after a reload, so each download is recorded once: an id is
 * claimed before the first await, and a row already in the database (a
 * reload, or identical bytes Rust deduplicated onto an existing upload) is
 * left as it is, so its file is never parsed twice. Either way the list
 * learns the row's id, which follows the file through Drive's moves.
 */

export interface RecordDeps {
  /** What a data-dir-relative path's row hangs off, or null if nothing known. */
  homeOf: (relativePath: string) => Promise<FileHome | null>;
  /** The id of the `files` row at a path, or null. */
  rowAt: (relativePath: string) => Promise<number | null>;
  /** Writes the rows and kicks the parses: `recordUploads`. */
  record: (home: FileHome, outcomes: ImportOutcome[]) => Promise<void>;
  /** A saved download's `files` row. */
  onRow: (download: number, file: number) => void;
}

export function createSavedRecorder(deps: RecordDeps) {
  const claimed = new Set<number>();

  async function recordOne(d: Download): Promise<void> {
    const saved = d.saved_to;
    if (saved?.kind !== "drive" || !saved.outcome.file) return;
    const path = saved.outcome.file.relative_path;
    let row = await deps.rowAt(path);
    if (row == null) {
      const home = await deps.homeOf(path);
      if (!home) throw new Error(`nothing in Drive holds ${path}`);
      await deps.record(home, [saved.outcome]);
      row = await deps.rowAt(path);
    }
    if (row != null) deps.onRow(d.id, row);
  }

  /** Records every saved Drive download not recorded yet. A failure frees
   *  the id, so the next list tries it again. */
  return async function recordSaved(downloads: readonly Download[]): Promise<void> {
    const fresh = downloads.filter(
      (d) => d.state === "saved" && d.saved_to?.kind === "drive" && !claimed.has(d.id),
    );
    for (const d of fresh) claimed.add(d.id);
    await Promise.all(
      fresh.map((d) =>
        recordOne(d).catch((e) => {
          claimed.delete(d.id);
          console.warn(`[downloads] could not record download ${d.id}: ${e}`);
        }),
      ),
    );
  };
}
