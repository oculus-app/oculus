import type { Subject } from "@/lib/db";
import { addUploads } from "@/lib/files/uploads";
import { parseFile } from "@/lib/files/courseFiles";
import { isPipelineFile } from "@/lib/files/fileTypes";
import { copyToOwn, createFolder, deleteEntries, driveErrorText, moveEntries, renameEntry } from "./commands";
import { announceDriveChange, listFolder } from "./listing";
import { homeOf } from "./home";
import { baseName, freeName } from "./paths";

/**
 * What Drive does to the library, each followed by `announceDriveChange` so
 * every listing, tree and file list of the subject (or of the top level)
 * reloads. A failure is
 * reported through {@link reportDriveProblem}; the browser shows it in a line
 * above its entries (no toasts).
 */

export const DRIVE_PROBLEM_EVENT = "oculus:drive-problem";

export function reportDriveProblem(text: string): void {
  window.dispatchEvent(new CustomEvent(DRIVE_PROBLEM_EVENT, { detail: text }));
}

async function attempt<T>(rel: string, subjects: readonly Subject[], run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    reportDriveProblem(driveErrorText(error));
    return null;
  } finally {
    announceDriveChange(homeOf(rel, subjects)?.id);
  }
}

/** Finder files or folders copied into `targetDir`. */
export async function importInto(paths: string[], targetDir: string, subjects: readonly Subject[]): Promise<void> {
  const home = homeOf(targetDir, subjects);
  if (!home) return reportDriveProblem("Files can't be added here");
  await attempt(targetDir, subjects, async () => {
    const outcomes = await addUploads(home, paths, targetDir);
    const failed = outcomes.filter((o) => o.error).map((o) => `${o.source}: ${o.error}`);
    if (failed.length) reportDriveProblem(failed.join("\n"));
  });
}

/** Own entries moved and synced ones copied into `targetDir`; each copy is
 *  parsed as its own file. */
export async function dropInto(
  plan: { move: string[]; copy: string[] },
  targetDir: string,
  subjects: readonly Subject[],
): Promise<void> {
  await attempt(targetDir, subjects, async () => {
    if (plan.move.length) await moveEntries(plan.move, targetDir);
    if (plan.copy.length) await copyInto(plan.copy, targetDir, subjects);
  });
}

async function copyInto(rels: string[], targetDir: string, subjects: readonly Subject[]): Promise<void> {
  const copies = await copyToOwn(rels, targetDir);
  const home = homeOf(targetDir, subjects);
  if (!home) return;
  for (const rel of await filesOf(copies)) {
    if (isPipelineFile(baseName(rel))) {
      parseFile(home.id, home.code, rel).catch((e) => console.warn(`[drive] parse ${rel}: ${e}`));
    }
  }
}

/** The files among `rels`, a copied folder standing for every file below it.
 *  Rust has written each one's row already. */
async function filesOf(rels: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const rel of rels) {
    try {
      files.push(...(await listFolder(rel, true)).files.map((f) => f.relativePath));
    } catch {
      files.push(rel);
    }
  }
  return files;
}

/** Synced entries copied into the student's `targetDir`. */
export async function copyToFolder(rels: string[], targetDir: string, subjects: readonly Subject[]): Promise<void> {
  await attempt(targetDir, subjects, () => copyInto(rels, targetDir, subjects));
}

export async function moveToFolder(rels: string[], targetDir: string, subjects: readonly Subject[]): Promise<void> {
  await attempt(targetDir, subjects, () => moveEntries(rels, targetDir));
}

/** The entry's new path, or null when the rename failed. */
export function renameTo(rel: string, name: string, subjects: readonly Subject[]): Promise<string | null> {
  return attempt(rel, subjects, () => renameEntry(rel, name.trim()));
}

export async function deleteAll(rels: string[], subjects: readonly Subject[]): Promise<boolean> {
  return (await attempt(rels[0] ?? "", subjects, async () => { await deleteEntries(rels); return true; })) ?? false;
}

/** A new folder in `dir`, named clear of `taken`; its path, or null. */
export function newFolderIn(dir: string, taken: Iterable<string>, subjects: readonly Subject[]): Promise<string | null> {
  const name = freeName("Untitled folder", taken);
  return attempt(dir, subjects, () => createFolder(dir ? `${dir}/${name}` : name));
}
