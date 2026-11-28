import { COURSES_DIR } from "@/lib/files/libraryLayout";
import { DB_PATH } from "@/lib/files/statePaths";
import { displayCode } from "@/lib/format/format";

/** How Settings → Storage groups the files `storage_report` lists, each by
 *  its data-dir-relative path. */

/** A file's type: the database with the files SQLite keeps beside it, else
 *  by extension. */
export function storageType(path: string): string {
  if (path.startsWith(DB_PATH)) return "Database";
  const name = (path.split("/").pop() ?? path).toLowerCase();
  if (name.endsWith(".pdf")) return "PDFs";
  if (/\.(mp4|m4v|mov|webm)$/.test(name)) return "Videos";
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) return "Images";
  if (name.endsWith(".md")) return "Markdown";
  return "Other";
}

/** Whose a file is: its subject's, by the subject's folder, or the app's for
 *  `.oculus/` and anything else outside a subject. A `lectures/<id>` folder
 *  at the top of the data dir is its lecture's subject's. */
export function storageOwner(
  path: string,
  subjectByDir: ReadonlyMap<string, string>,
  subjectByLecture: ReadonlyMap<string, string>,
): string {
  const [top, second] = path.split("/");
  if (top === COURSES_DIR && second) return subjectByDir.get(second) ?? displayCode(second);
  if (top === "lectures" && second) return subjectByLecture.get(second) ?? "Lectures";
  return "App data";
}
