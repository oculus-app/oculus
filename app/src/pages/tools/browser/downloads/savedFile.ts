import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Download } from "@/lib/browser/downloads/types";
import { getFileById, getFileByRelativePath, getSubjects, type DbFile } from "@/lib/db";
import { deleteEntries } from "@/lib/drive/commands";
import { homeOf } from "@/lib/drive/home";
import { stillRowFile } from "@/lib/browser/downloads/deletable";
import { downloads } from "@/lib/browser/downloads/commands";
import { announceDriveChange, listFolder } from "@/lib/drive/listing";
import { parentRel } from "@/lib/drive/paths";
import { driveFolderHref } from "@/lib/drive/routes";
import { openFileSmart } from "@/lib/files/openFile";
import { loadDataDir } from "@/hooks/backend/useDataDir";
import { usePendingDeleteStore } from "@/stores/drive/pendingDeleteStore";
import { useTabStore } from "@/stores/shell/tabStore";

/**
 * A download saved to Drive, acted on where it is now: the list knows the
 * file by its `files` row id once recorded, which a move or rename in Drive
 * keeps. Before that only the path it landed at names it.
 */

const GONE = "It is no longer in Drive";

/** The file's row, or null once it is gone. A known row id is never traded
 *  for the path, which another file may hold since. */
export async function savedFile(d: Download, row: number | undefined): Promise<DbFile | null> {
  if (row != null) return getFileById(row);
  const path = d.saved_to?.kind === "drive" ? d.saved_to.outcome.file?.relative_path : null;
  return path ? getFileByRelativePath(path) : null;
}

async function present(d: Download, row: number | undefined): Promise<DbFile> {
  const file = await savedFile(d, row);
  if (!file) throw new Error(GONE);
  return file;
}

/** Its page beside the browser, or the system viewer for a type with none. */
export async function openSaved(d: Download, row: number | undefined): Promise<void> {
  openFileSmart(await present(d, row));
}

/** Drive, in a new tab, on the folder holding it. */
export async function showInDrive(d: Download, row: number | undefined): Promise<void> {
  const file = await present(d, row);
  useTabStore.getState().addTab(driveFolderHref(parentRel(file.relative_path)));
}

export async function revealSaved(d: Download, row: number | undefined): Promise<void> {
  const file = await present(d, row);
  await revealItemInDir(`${await loadDataDir()}/${file.relative_path}`);
}

/** Sends the download `id`'s file to the Trash as Drive deletes it
 *  (`delete_entries`, with the Undo toast), found by its row id alone
 *  (`mayDelete`); its list entry hides while the delete is pending and
 *  clears once it is final. One gone, or no longer the file the row holds
 *  (`stillRowFile`), deletes nothing: the entry just clears. */
export async function deleteSaved(id: number, row: number): Promise<void> {
  const clear = () => void downloads.clear(id);
  const file = await getFileById(row);
  if (!file) return clear();
  const listing = await listFolder(parentRel(file.relative_path)).catch(() => null);
  if (!listing || !stillRowFile(file, listing.files)) return clear();
  const sent = await deleteEntries([file.relative_path]);
  usePendingDeleteStore.getState().show(sent, { download: id, onFinal: clear });
  announceDriveChange(homeOf(file.relative_path, await getSubjects())?.id);
}
