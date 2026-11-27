import { BookOpen, FolderSimple, LockSimple, type Icon } from "@phosphor-icons/react";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import type { Subject } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { isSubjectsFolder } from "@/lib/drive/home";
import { parentRel, subjectForFolder } from "@/lib/drive/paths";
import { SUBJECTS_LABEL } from "@/lib/files/labels";

/**
 * The trail from the browser's root to `folder`: the root's own label, then
 * one crumb per folder. From Drive's top level the folder of subjects is
 * Subjects, with the rail's book, and a subject's folder its code and icon;
 * every other folder, the student's top-level ones included, is its own
 * name. The last crumb is the folder on screen, locked when the student
 * can't add to it.
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
  const items: BreadcrumbItem[] = [
    { label: rootLabel, href: folder === root ? undefined : folderHref(root), icon: <RootIcon size={14} /> },
  ];
  const below = folder === root ? [] : folder.slice(root ? root.length + 1 : 0).split("/");
  let rel = root;
  below.forEach((name, index) => {
    rel = rel ? `${rel}/${name}` : name;
    const last = index === below.length - 1;
    const href = last ? undefined : folderHref(rel);
    if (isSubjectsFolder(rel)) {
      items.push({ label: SUBJECTS_LABEL, href, icon: <BookOpen size={14} /> });
      return;
    }
    const subject = isSubjectsFolder(parentRel(rel)) ? subjectForFolder(name, subjects) : undefined;
    const Glyph = last && locked ? LockSimple : FolderSimple;
    items.push({
      label: subject ? displayCode(subject.code) : name,
      href,
      icon: subject ? <SubjectIcon code={subject.code} size={14} /> : <Glyph size={14} />,
    });
  });
  return items;
}
