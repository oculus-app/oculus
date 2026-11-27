import { Folder, FolderSimple } from "@phosphor-icons/react";
import { useInSidePanel } from "@/components/tabs/PaneHeader";
import { BreadcrumbItems, type BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { driveFolderHref } from "@/lib/drive/routes";

/**
 * The trail before a top-level file's title, where a subject's file has
 * `SubjectCrumbs`: My Drive, then one crumb per folder the file sits in
 * (`folder`, data-dir-relative; `""` at the top level), each opening that
 * folder in Drive.
 */
export function DriveFileCrumbs({ folder }: { folder: string }) {
  const inSide = useInSidePanel();
  const items: BreadcrumbItem[] = [{ label: "My Drive", href: driveFolderHref(""), icon: <Folder size={12} /> }];
  let rel = "";
  for (const name of folder.split("/").filter(Boolean)) {
    rel = rel ? `${rel}/${name}` : name;
    items.push({ label: name, href: driveFolderHref(rel), icon: <FolderSimple size={12} /> });
  }
  return <BreadcrumbItems items={items} visible={inSide ? 0 : 2} trailing />;
}
