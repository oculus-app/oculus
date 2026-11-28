import { BookOpen, FolderSimple, LockSimple, type Icon } from "@phosphor-icons/react";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import type { Subject } from "@/lib/db";
import { isWithin } from "@/lib/drive/paths";
import { driveTrail } from "@/lib/drive/trail";

/**
 * The browser header's trail from its root to `folder`, as `Breadcrumb`
 * items: `driveTrail`'s places from the root down, the root under its own
 * label (My Drive, or Files in a subject). The last crumb is the folder on
 * screen, locked when the student can't add to it.
 */
export function driveCrumbs({ root, folder, rootLabel, rootIcon: RootIcon, subjects, folderHref, locked }: {
  root: string;
  folder: string;
  rootLabel: string;
  rootIcon: Icon;
  subjects: readonly Subject[];
  folderHref: (rel: string) => string;
  locked: boolean;
}): BreadcrumbItem[] {
  const parts = driveTrail(folder, subjects).filter((part) => !root || isWithin(part.rel, root));
  return parts.map((part, index) => {
    const last = index === parts.length - 1;
    const href = last ? undefined : folderHref(part.rel);
    if (part.rel === root) return { label: rootLabel, href, icon: <RootIcon size={14} /> };
    const Glyph = last && locked ? LockSimple : FolderSimple;
    return {
      label: part.label,
      href,
      icon: part.kind === "subject" ? <SubjectIcon code={part.code} size={14} />
        : part.kind === "subjects" ? <BookOpen size={14} />
        : <Glyph size={14} />,
    };
  });
}
