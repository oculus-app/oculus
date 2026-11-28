import { COURSES_DIR } from "@/lib/files/libraryLayout";
import { DRIVE_RECENT_HREF, driveFolderHref } from "./routes";

/**
 * Where a Drive route saved before the top level was the data folder goes.
 * Such a route named a folder under `courses/` (`/drive/<code>/Course`), or
 * Recent as `/drive/recent`; a saved tab, the closed stack and Recent may
 * carry one. Null while `rel` is a folder that exists (it is the student's),
 * or when nothing by that name is among the subjects either. `exists` asks
 * the disk for a data-dir-relative folder.
 */
export async function resolveLegacyDriveRoute(
  rel: string,
  exists: (rel: string) => Promise<boolean>,
): Promise<string | null> {
  if (!rel || rel === COURSES_DIR || rel.startsWith(`${COURSES_DIR}/`) || (await exists(rel))) return null;
  if (rel === "recent") return DRIVE_RECENT_HREF;
  const under = `${COURSES_DIR}/${rel}`;
  return (await exists(under)) ? driveFolderHref(under) : null;
}
