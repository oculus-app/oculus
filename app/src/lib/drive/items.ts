import type { DbFile, Subject } from "@/lib/db";
import { fileTitle } from "@/lib/files/openFile";
import { SUBJECTS_LABEL } from "@/lib/files/labels";
import { displayCode } from "@/lib/format/format";
import type { DriveZone, FileEntry, FolderEntry, RecordingEntry } from "./listing";
import { isSubjectsFolder } from "./home";
import { parentRel, subjectForFolder } from "./paths";

/** One entry on screen. `key` is its path, unique in a listing; the order of
 *  a list of these is the order on screen (selection ranges follow it). */
export type DriveItem =
  | { type: "folder"; key: string; name: string; entry: FolderEntry; subject?: Subject; subjects?: boolean }
  | { type: "recording"; key: string; name: string; entry: RecordingEntry }
  | { type: "file"; key: string; name: string; entry: FileEntry; row?: DbFile };

/** A folder as it is named on screen: the folder of subjects is Subjects
 *  (`subjects`), a folder directly inside it is named by its subject, and
 *  any other, the student's top-level folders included, by its own name. */
export function folderItem(entry: FolderEntry, subjects: readonly Subject[]): DriveItem {
  if (isSubjectsFolder(entry.relativePath)) {
    return { type: "folder", key: entry.relativePath, name: SUBJECTS_LABEL, entry, subjects: true };
  }
  const subject = isSubjectsFolder(parentRel(entry.relativePath))
    ? subjectForFolder(entry.name, subjects)
    : undefined;
  return {
    type: "folder",
    key: entry.relativePath,
    name: subject ? displayCode(subject.code) : entry.name,
    entry,
    subject,
  };
}

/** The folder of subjects or one subject's folder: Oculus's own, which the
 *  student never renames, moves or deletes, and which says nothing of it. */
export function isFixedFolder(item: DriveItem): boolean {
  return item.type === "folder" && (!!item.subject || !!item.subjects || isSubjectsFolder(parentRel(item.key)));
}

export function recordingItem(entry: RecordingEntry): DriveItem {
  return { type: "recording", key: entry.relativePath, name: entry.title, entry };
}

/** A file is named as its row names it (a note without `.md`, a synced
 *  page's slug humanised), else as on disk. */
export function fileItem(entry: FileEntry, rows: ReadonlyMap<string, DbFile>): DriveItem {
  const row = rows.get(entry.relativePath);
  return { type: "file", key: entry.relativePath, name: row ? fileTitle(row) : entry.name, entry, row };
}

export function itemZone(item: DriveItem): DriveZone {
  return item.type === "recording" ? "synced" : item.entry.zone;
}

/** The student may rename, move and delete it. */
export function itemEditable(item: DriveItem): boolean {
  return item.type !== "recording" && item.entry.editable;
}

/** The name on disk, which a rename starts from. */
export function diskName(item: DriveItem): string {
  return item.type === "recording" ? item.entry.title : item.entry.name;
}
