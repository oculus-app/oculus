import { COURSES_DIR } from "@/lib/files/libraryLayout";
import type { Subject } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { subjectForFolder } from "./paths";

export const DRIVE_LABEL = "My Drive";
export const SUBJECTS_LABEL = "Subjects";

/** One place on the way to a Drive path. Only a `subject` is drawn with its
 *  icon and short code; every other folder shows its name as it is on disk. */
export type DriveTrailPart =
  | { kind: "drive" | "subjects" | "folder"; rel: string; label: string }
  | { kind: "subject"; rel: string; label: string; code: string };

/**
 * The places from My Drive down to `rel`, a path relative to the data folder.
 * `from: "subject"` starts at the subject instead, for a line with little
 * room; a path outside every subject still starts at My Drive.
 */
export function driveTrail(
  rel: string,
  subjects: readonly Subject[],
  from: "drive" | "subject" = "drive",
): DriveTrailPart[] {
  const parts: DriveTrailPart[] = [{ kind: "drive", rel: "", label: DRIVE_LABEL }];
  const names = rel.split("/").filter(Boolean);
  let at = "";
  let start = 0;
  names.forEach((name, index) => {
    at = at ? `${at}/${name}` : name;
    const inSubjects = names[0] === COURSES_DIR;
    const subject = inSubjects && index === 1 ? subjectForFolder(name, subjects) : undefined;
    if (subject) {
      start = parts.length;
      parts.push({ kind: "subject", rel: at, label: displayCode(subject.code), code: subject.code });
    } else if (inSubjects && index === 0) {
      parts.push({ kind: "subjects", rel: at, label: SUBJECTS_LABEL });
    } else {
      parts.push({ kind: "folder", rel: at, label: name });
    }
  });
  return from === "subject" ? parts.slice(start) : parts;
}
