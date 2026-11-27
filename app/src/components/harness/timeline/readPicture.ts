import { inNotebookPagesDir, stateRel } from "@/lib/files/statePaths";
import { isImagePath } from "@/lib/harness/attachments";

/** The asset for a Read row, where the file is (`stateRel`): a stored row can
 *  name a state folder at the top of the data dir, and a notebook page under
 *  `canvas-pages/`. */
export function readPicturePath(raw: unknown, dataDir: string): string | null {
  if (!dataDir || typeof raw !== "string" || !isImagePath(raw)) return null;
  const path = raw.replace(/\\/g, "/");
  const prefix = dataDir + "/";
  const inside = path.startsWith(prefix);
  const relative = inside ? path.slice(prefix.length) : path.replace(/^\.\.\//, "");
  if (relative.split("/").includes("..")) return null;
  const rel = stateRel(relative);
  if (inside || inNotebookPagesDir(rel)) return prefix + rel;
  // Tauri checks absolute image reads against the asset scope.
  return /^(?:\/|[A-Za-z]:\/)/.test(path) ? path : null;
}
