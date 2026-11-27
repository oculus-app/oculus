import { BookOpen, Folder, FolderSimple, type IconWeight } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import type { TrailCrumb } from "@/components/ui/Trail";
import type { DriveTrailPart } from "@/lib/drive/trail";

/**
 * `driveTrail`'s places as `Trail` crumbs: My Drive's and the Subjects
 * folder's glyphs, a subject's own icon, a folder glyph for the rest. With
 * `onOpen` every crumb but the last is a button that opens its place.
 * `folders: false` leaves plain folders bare, for a line of small type.
 */
export function driveTrailCrumbs(parts: readonly DriveTrailPart[], { size = 14, weight = "regular", folders = true, onOpen }: {
  size?: number;
  weight?: IconWeight;
  folders?: boolean;
  onOpen?: (rel: string) => void;
} = {}): TrailCrumb[] {
  return parts.map((part, index) => ({
    label: part.label,
    icon: part.kind === "subject" ? <SubjectIcon code={part.code} size={size} />
      : part.kind === "drive" ? <Folder size={size} />
      : part.kind === "subjects" ? <BookOpen size={size} />
      : folders ? <FolderSimple size={size} weight={weight} /> : undefined,
    onClick: onOpen && index < parts.length - 1 ? () => onOpen(part.rel) : undefined,
  }));
}
