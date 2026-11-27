import { inNotebookPagesDir, stateRel } from "@/lib/files/statePaths";
import { isImagePath } from "@/lib/harness/attachments";

/** The steps up from the agents' cwd to the data dir: `../../` from
 *  `.oculus/agents/`, `../` in older chats, from `agents/` (as citations
 *  read them, `lib/citations/parse.ts`). */
const UP = /^(?:\.\.\/){1,2}/;

/** The asset for a Read row, where the file is (`stateRel`): a stored row can
 *  name a state folder at the top of the data dir, and a notebook page under
 *  `canvas-pages/`. A path up from the cwd is the data dir's. */
export function readPicturePath(raw: unknown, dataDir: string): string | null {
  if (!dataDir || typeof raw !== "string" || !isImagePath(raw)) return null;
  const path = raw.replace(/\\/g, "/");
  const prefix = dataDir + "/";
  const inside = path.startsWith(prefix);
  const up = UP.test(path);
  const relative = inside ? path.slice(prefix.length) : path.replace(UP, "");
  if (relative.split("/").includes("..")) return null;
  const rel = stateRel(relative);
  if (inside || up || inNotebookPagesDir(rel)) return prefix + rel;
  // Tauri checks absolute image reads against the asset scope.
  return /^(?:\/|[A-Za-z]:\/)/.test(path) ? path : null;
}
