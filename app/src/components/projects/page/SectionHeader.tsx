import { PageHeader, PaneTrail } from "@/components/tabs/PaneHeader";
import { SideNavCollapseToggle } from "@/components/ui/layout/SideNav";
import { useTasksPanel } from "@/layouts/TasksLayout";

/**
 * The Tasks/Projects pages' 48px header row, navigation only: the nav
 * column's fold toggle at its start (absent where there is no column, e.g.
 * in the side panel), the page's title and its muted `meta` (a count). The
 * page's controls are its `TaskToolbar` under it.
 */
export function SectionHeader({
  title,
  meta,
}: {
  title?: string;
  meta?: string;
}) {
  const panel = useTasksPanel();

  return (
    <PageHeader>
      <PaneTrail lead={panel && <SideNavCollapseToggle panel={panel} />} title={title ?? ""} meta={meta} />
    </PageHeader>
  );
}
