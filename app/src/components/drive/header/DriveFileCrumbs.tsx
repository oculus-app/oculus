import { Folder, FolderSimple } from "@phosphor-icons/react";
import { PaneTrail, useInSidePanel } from "@/components/tabs/PaneHeader";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { driveFolderHref } from "@/lib/drive/routes";
import { DRIVE_LABEL } from "@/lib/drive/trail";

/**
 * A top-level file's trail, where a subject's file has `SubjectTrail`: My
 * Drive, then one crumb per folder the file sits in (`folder`,
 * data-dir-relative; `""` at the top level), each opening that folder in
 * Drive, then the file's `title`.
 */
export function DriveFileTrail({ folder, title }: { folder: string; title: string }) {
  const size = useInSidePanel() ? 14 : 12;
  const items: BreadcrumbItem[] = [{ label: DRIVE_LABEL, href: driveFolderHref(""), icon: <Folder size={size} /> }];
  let rel = "";
  for (const name of folder.split("/").filter(Boolean)) {
    rel = rel ? `${rel}/${name}` : name;
    items.push({ label: name, href: driveFolderHref(rel), icon: <FolderSimple size={size} /> });
  }
  return <PaneTrail parents={items} title={title} />;
}
