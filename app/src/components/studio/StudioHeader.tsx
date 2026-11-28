import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "@phosphor-icons/react";

import { PageHeader, PaneTrail, useInSidePanel } from "@/components/tabs/PaneHeader";
import { SideNavCollapseToggle } from "@/components/ui/layout/SideNav";
import { useStudioPanel } from "@/layouts/StudioLayout";

/** A Studio page's 48px header row, navigation only: the nav column's toggle
 *  (none in the side panel, which has no nav column), an optional way back,
 *  and the title with a muted note beside it. A page's controls go in the
 *  row under it (`PaneToolbar`). */
export function StudioHeader({
  title,
  meta,
  back,
}: {
  title: string;
  /** Muted beside the title: a series part's "Part 2/5". */
  meta?: string | null;
  /** Where the arrow before the title goes. */
  back?: string;
}) {
  const panel = useStudioPanel();
  const navigate = useNavigate();
  const inSide = useInSidePanel();
  return (
    <PageHeader>
      <PaneTrail
        lead={
          <>
            {!inSide && <SideNavCollapseToggle panel={panel} />}
            {back && (
              <button
                type="button"
                aria-label="Back"
                data-tab-href={back}
                onClick={() => navigate(back)}
                className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft size={15} />
              </button>
            )}
          </>
        }
        title={title}
        meta={meta}
      />
    </PageHeader>
  );
}
