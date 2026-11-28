import type { Subject } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { isSubjectsFolder } from "./home";
import type { FolderEntry, FolderListing } from "./listing";
import { baseName, parentRel, subjectForFolder } from "./paths";
import { SUBJECTS_LABEL } from "./trail";

/**
 * What a caller asks the Drive picker (`pickDriveFolder`) and what it
 * answers. Paths are data-dir-relative; `""` is Drive's top level.
 */
export interface DrivePickerRequest {
  /** The dialog's title: "Move to", "Save to Drive", "Render Final". */
  title: string;
  /** The confirming button's label: "Move here", "Save", "Render". */
  action: string;
  /** The folder to open on. Left out, the dialog opens on the last
   *  destination any caller chose, or the top level. One that is gone, or
   *  that the student can't add to, falls back to the nearest folder above
   *  it that will do. */
  start?: string | null;
  /** When `start` is missing but the folder holding it is a place: open on
   *  `start` anyway, drawn as the destination, and make it only when the
   *  student confirms there (Studio's suggested `Videos`). */
  makeStart?: boolean;
  /** A file name to show and let the student edit. */
  name?: string;
}

export interface DrivePick {
  /** The folder chosen; a new folder named in the dialog is made first. */
  targetDir: string;
  /** The name as edited, trimmed; null when the request had none. */
  name: string | null;
}

/** The `settings` row holding the last folder any caller's picker confirmed. */
export const LAST_DESTINATION_KEY = "drive_picker_last_destination";

export const lastDestination = (): Promise<string | null> => getSetting(LAST_DESTINATION_KEY);

export const rememberDestination = (rel: string): Promise<void> => setSetting(LAST_DESTINATION_KEY, rel);

/** A folder the picker can stand in: one the student may add to, or the
 *  folder of subjects, which is only a place to go through. */
export const isPickerPlace = (listing: Pick<FolderListing, "rel" | "writable">): boolean =>
  listing.writable || isSubjectsFolder(listing.rel);

/**
 * The listing the picker opens on: `start`, or the nearest folder above it
 * that exists and is a place the picker shows. The top level always is one,
 * so this only rejects when the library can't be read at all.
 */
export async function settleStart(
  start: string,
  list: (rel: string) => Promise<FolderListing>,
): Promise<FolderListing> {
  for (let rel = start; ; rel = parentRel(rel)) {
    try {
      const listing = await list(rel);
      if (isPickerPlace(listing)) return listing;
    } catch (error) {
      if (!rel) throw error;
    }
    if (!rel) throw new Error("Drive has no folder to save in");
  }
}

/**
 * The request's start, when `makeStart` asks to open on it though it is
 * missing: `place`, where the picker settled, is the folder that would hold
 * it, takes new entries and has no folder of that name. Null otherwise. The
 * dialog asks only until the student goes elsewhere.
 */
export function pendingStart(
  request: Pick<DrivePickerRequest, "start" | "makeStart">,
  place: Pick<FolderListing, "rel" | "writable" | "folders"> | null,
): string | null {
  const start = request.makeStart ? request.start : null;
  if (!start || !place?.writable || place.rel !== parentRel(start)) return null;
  const name = baseName(start).toLowerCase();
  return place.folders.some((f) => f.name.toLowerCase() === name) ? null : start;
}

/** One row of the picker's list. `subject` is set for a subject's folder
 *  (labelled by its short code), `subjects` for the folder of subjects;
 *  every other row is a folder under its own name. */
export interface PickerFolder {
  rel: string;
  label: string;
  subject?: Subject;
  subjects?: boolean;
}

/**
 * The folders the picker lists for `listing`: only places the student can
 * add to (so `Course/` never shows), plus Subjects at the top level. Inside
 * Subjects, the subjects Oculus knows, the current ones in `current` and the
 * rest in `past`.
 */
export function pickerFolders(
  listing: FolderListing,
  subjects: readonly Subject[],
): { current: PickerFolder[]; past: PickerFolder[] } {
  if (isSubjectsFolder(listing.rel)) {
    const rows = listing.folders.flatMap((entry) => {
      const subject = subjectForFolder(entry.name, subjects);
      return subject && entry.writable ? [{ rel: entry.relativePath, label: displayCode(subject.code), subject }] : [];
    });
    return {
      current: rows.filter((row) => row.subject.is_current),
      past: rows.filter((row) => !row.subject.is_current),
    };
  }
  const row = (entry: FolderEntry): PickerFolder[] =>
    isSubjectsFolder(entry.relativePath) ? [{ rel: entry.relativePath, label: SUBJECTS_LABEL, subjects: true }]
      : entry.writable ? [{ rel: entry.relativePath, label: entry.name }]
      : [];
  return { current: listing.folders.flatMap(row), past: [] };
}
