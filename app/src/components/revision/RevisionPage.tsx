import { useRef, type ReactNode } from "react";
import { PageHeader, PaneTrail } from "@/components/tabs/PaneHeader";
import { SideNavCollapseToggle } from "@/components/ui/layout/SideNav";
import { useRevisionPanel } from "@/layouts/RevisionLayout";
import { useRevisionData } from "@/layouts/RevisionLayout";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
/** A Revision page: the header row (the nav toggle and the title), an
 *  optional row of controls under it (`toolbar`, a `PaneToolbar`), and the
 *  page's one scroller. */
export function RevisionPage({
  title,
  toolbar,
  children,
}: {
  title: string;
  toolbar?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRevisionPanel();
  const { loading, error } = useRevisionData();
  const scroll = useRef<HTMLDivElement>(null);
  useScrollFade(scroll);
  return (
    <>
      <PageHeader>
        <PaneTrail lead={<SideNavCollapseToggle panel={panel} />} title={title} />
      </PageHeader>
      {toolbar}
      <div ref={scroll} className="page-scroll min-h-0 flex-1">
        <div className="mx-auto max-w-4xl space-y-5 px-6 py-5">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {loading && (
            <p className="text-sm text-muted-foreground">Loading revision…</p>
          )}
          {children}
        </div>
      </div>
    </>
  );
}
