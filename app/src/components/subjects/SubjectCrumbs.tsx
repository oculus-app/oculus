import type { ReactNode } from "react";
import { FolderSimple } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { subjectTabIcon } from "@/components/subjects/nav/tabs";
import { useSubjects } from "@/hooks/data/useSubjects";
import { PaneTrail, useInSidePanel } from "@/components/tabs/PaneHeader";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { filesFolderHref } from "@/lib/drive/routes";
import { parentRel } from "@/lib/drive/paths";
import { courseRelOf } from "@/lib/files/libraryLayout";
import { displayCode } from "@/lib/format/format";

/** A subject tab as a crumb: path segment under the subject, and its label. */
export interface CrumbTab {
  to: string;
  label: string;
}

export const LECTURES_TAB: CrumbTab = { to: "lectures", label: "Lectures" };

/** The folder a library file sits in, inside its subject (`Course/Files`),
 *  for `SubjectTrail`'s `folder`; `""` at the subject's root. */
export const fileCrumbFolder = (file: { relative_path: string }): string =>
  parentRel(courseRelOf(file.relative_path));

/**
 * A subject page's trail: the subject, then a tab or a file's folders, then
 * the page's `title`. `folder` is a file's folder inside the subject: Files,
 * then one crumb per folder, each opening that folder in the subject's Files
 * tab. One of the subject's own tabs (neither `tab` nor `folder`) is, in the
 * side panel, its title alone under the subject's icon.
 */
export function SubjectTrail({ subjectId, tab, folder, title, lead }: {
  subjectId: number;
  tab?: CrumbTab | null;
  folder?: string;
  title: string;
  lead?: ReactNode;
}) {
  const { subjects } = useSubjects();
  const subject = subjects.find((s) => s.id === subjectId);
  const inSide = useInSidePanel();
  const size = inSide ? 14 : 12;
  const items: BreadcrumbItem[] = [];
  if (subject && !(inSide && !tab && folder == null)) {
    items.push({
      label: displayCode(subject.code), href: `/subjects/${subject.id}`,
      icon: <SubjectIcon code={subject.code} size={size} />,
    });
    if (tab) {
      const Icon = subjectTabIcon(tab.to);
      items.push({ label: tab.label, href: `/subjects/${subject.id}/${tab.to}`, icon: <Icon size={size} /> });
    }
    if (folder != null) {
      const Files = subjectTabIcon("files");
      items.push({ label: "Files", href: filesFolderHref(subject.id, ""), icon: <Files size={size} /> });
      let rel = "";
      for (const name of folder.split("/").filter(Boolean)) {
        rel = rel ? `${rel}/${name}` : name;
        items.push({ label: name, href: filesFolderHref(subject.id, rel), icon: <FolderSimple size={size} /> });
      }
    }
  }
  return <PaneTrail lead={lead} parents={items} title={title} />;
}
