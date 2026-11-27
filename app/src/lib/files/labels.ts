import type { DbFile } from "@/lib/db";
import { displayCode, humanizeSlug } from "@/lib/format/format";
import { isLessonAsset } from "./fileTypes";
import { COURSES_DIR, TOP_LEVEL } from "./libraryLayout";

/** Categories whose rows carry real filenames, not Canvas slugs. */
const REAL_FILENAME = new Set(["file", "image", "upload"]);

/** A file's display title: real filenames stay, slugs get humanised. Takes
 *  two columns so the chat's `@` menu can label a path the same way. */
export function fileTitle(file: Pick<DbFile, "category" | "filename">): string {
  // A document's filename was typed by the student: never humanise it.
  if (file.category === "whiteboard") return file.filename.replace(/\.whiteboard$/i, "");
  if (file.category === "notebook") return file.filename.replace(/\.notebook$/i, "");
  if (file.category === "document") return file.filename.replace(/\.md$/i, "");
  return REAL_FILENAME.has(file.category ?? "") || isLessonAsset(file)
    ? file.filename
    : humanizeSlug(file.filename);
}

/** What Drive calls the folder of subjects (`courses/` on disk). */
export const SUBJECTS_LABEL = "Subjects";

/** A folder path's display name: the folder of subjects by its label, a
 *  subject's own folder by its code, any other humanised. */
export function folderTitle(path: string): string {
  const parts = path.replace(/\/+$/, "").split("/");
  const name = parts[parts.length - 1] ?? "";
  if (parts[0] !== COURSES_DIR) return humanizeSlug(name);
  if (parts.length === 1) return SUBJECTS_LABEL;
  return parts.length === 2 ? displayCode(name) : humanizeSlug(name);
}

/** The page of a top-level file, which has no subject. A dot-name, so no
 *  folder Drive shows can take the route (`app/src/lib/drive/routes.ts`). */
export const TOP_LEVEL_FILE_ROUTE = "/drive/.file";

/** A file's page: in its subject, or for a top-level file (whose row hangs
 *  off `TOP_LEVEL`) in Drive. */
export function filePagePath(subjectId: number, relativePath: string): string {
  const base = subjectId === TOP_LEVEL.id ? TOP_LEVEL_FILE_ROUTE : `/subjects/${subjectId}/file`;
  return `${base}?path=${encodeURIComponent(relativePath)}`;
}

/** The subject id (`TOP_LEVEL.id` for a top-level file) a file page's
 *  pathname names, or null for any other route. */
export function fileRouteSubject(pathname: string): number | null {
  if (pathname === TOP_LEVEL_FILE_ROUTE) return TOP_LEVEL.id;
  const m = /^\/subjects\/(\d+)\/file$/.exec(pathname);
  return m ? Number(m[1]) : null;
}
