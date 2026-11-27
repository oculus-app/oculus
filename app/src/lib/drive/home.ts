import type { Subject } from "@/lib/db";
import { COURSES_DIR, isTopLevelPath, TOP_LEVEL } from "@/lib/files/libraryLayout";
import { subjectFolderOf, subjectForFolder } from "./paths";

/** What a file's row hangs off and its creators are told: a subject, or
 *  `TOP_LEVEL` for the data folder's top level. */
export interface FileHome {
  id: number;
  code: string;
}

/** The folder of subjects (`courses`): a place to go through, never one of
 *  the student's. */
export const isSubjectsFolder = (rel: string): boolean => rel === COURSES_DIR;

export const isTopLevel = (home: FileHome | undefined): boolean => home?.id === TOP_LEVEL.id;

/** The home of a data-dir-relative path: its subject, or `TOP_LEVEL` for the
 *  top level (`""`) and the student's folders there. Undefined for the
 *  folder of subjects itself and for a folder of no known subject. */
export function homeOf(rel: string, subjects: readonly Subject[]): FileHome | undefined {
  if (rel === "" || isTopLevelPath(rel)) return TOP_LEVEL;
  const folder = subjectFolderOf(rel);
  return folder ? subjectForFolder(folder, subjects) : undefined;
}
