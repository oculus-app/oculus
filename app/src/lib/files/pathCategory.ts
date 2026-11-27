import type { DbFile } from "@/lib/db";
import { categoryOf, categoryOfPath, courseRelOf } from "@/lib/files/libraryLayout";
import { inAgentsDir } from "@/lib/files/statePaths";

/** Category and filename derived from a library path — enough for
 *  `categoryIconFor` and `fileTitle` without a query. A file in the agents'
 *  workspace is in no subject, so only its extension says what it is. */
export function pathFile(path: string): Pick<DbFile, "category" | "filename"> {
  const rel = courseRelOf(path);
  const filename = rel.slice(rel.lastIndexOf("/") + 1);
  return { category: inAgentsDir(path) ? categoryOf(filename) : categoryOfPath(path), filename };
}
