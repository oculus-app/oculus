import type { ReactNode } from "react";
import { PaneBreadcrumb, PaneHeaderRow } from "@/components/tabs/PaneHeader";
import type { BreadcrumbItem } from "@/components/ui/Breadcrumb";

/**
 * The browser's 48px header: Drive's nav toggle and the trail from Files,
 * nothing else; the search and New are the toolbar's (`DriveToolbar`). In
 * the side panel the trail is the panel's header (`PaneBreadcrumb`) and
 * this row takes no space.
 */
export function DriveHeader({ crumbs, leading }: {
  crumbs: BreadcrumbItem[];
  /** Before the trail: Drive's nav toggle, when the page has one. */
  leading?: ReactNode;
}) {
  return (
    <PaneHeaderRow className="flex h-12 shrink-0 items-center gap-3 px-5">
      <PaneBreadcrumb lead={leading} items={crumbs} />
    </PaneHeaderRow>
  );
}
