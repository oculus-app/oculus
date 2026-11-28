/**
 * The two routes that show a library folder, and their parsers. Drive's
 * splat is the data-dir-relative path (`/drive` is the top level,
 * `/drive/courses/<code>/Course/Files` a subject's folder, `/drive/Videos`
 * one of the student's); a subject's Files tab's splat is the path inside
 * that subject (`/subjects/<id>/files/Course/Files`). Each segment is
 * URL-encoded on its own, so a folder name may hold spaces, `#` or `?`.
 * Drive's own pages are dot-names (`/drive/.recent`, `/drive/.file`), which
 * no folder Drive shows can take.
 */

export const DRIVE_HREF = "/drive";
export const DRIVE_RECENT_HREF = "/drive/.recent";

const encode = (path: string): string =>
  path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

function decode(splat: string): string {
  return splat
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

/** Drive's route for a data-dir-relative folder: `""` is the top level. */
export function driveFolderHref(rel: string): string {
  const splat = encode(rel);
  return splat ? `${DRIVE_HREF}/${splat}` : DRIVE_HREF;
}

/** A subject's Files tab on a folder inside the subject (`""` is its root). */
export function filesFolderHref(subjectId: number, subjectRel: string): string {
  const splat = encode(subjectRel);
  return splat ? `/subjects/${subjectId}/files/${splat}` : `/subjects/${subjectId}/files`;
}

/** The data-dir-relative folder a Drive route shows (`""` at the top level),
 *  or null for any other route, Drive's own dot-named pages included. Takes
 *  a pathname or a full path with a query. */
export function parseDriveRoute(pathname: string): string | null {
  const m = /^\/drive(?:\/([^?#]*))?(?:[?#].*)?$/.exec(pathname);
  if (!m) return null;
  const rel = decode(m[1] ?? "");
  return rel.startsWith(".") ? null : rel;
}

/** The subject and the folder inside it (`""` at its root) a Files route
 *  shows, or null for any other route. */
export function parseFilesRoute(pathname: string): { subjectId: number; inner: string } | null {
  const m = /^\/subjects\/(\d+)\/files(?:\/([^?#]*))?(?:[?#].*)?$/.exec(pathname);
  if (!m) return null;
  return { subjectId: Number(m[1]), inner: decode(m[2] ?? "") };
}
