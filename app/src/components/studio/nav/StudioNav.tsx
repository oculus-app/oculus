import { Cube, FilmSlate, Palette, Plus, SquaresFour, Translate } from "@phosphor-icons/react";

import { NewCountBadge } from "@/components/NewCountBadge";

import { storedSubject } from "@/components/studio/videos/SubjectPills";
import { ResizeHandle } from "@/components/ui/layout/ResizeHandle";
import {
  SIDE_NAV_FOLDS,
  SIDE_NAV_ROW,
  SIDE_NAV_ROW_IDLE,
  SideNav,
  SideNavHeading,
  SideNavLink,
} from "@/components/ui/layout/SideNav";
import type { useSideNavPanel } from "@/hooks/ui/useSideNavPanel";
import { useStartVideo } from "@/hooks/studio/useNewVideoChat";
import { COMPONENTS_HREF, PRONUNCIATION_HREF, THEMES_HREF, VIDEOS_HREF } from "@/lib/studio/routes";
import { cn } from "@/lib/utils";
import { usePendingCount } from "@/stores/studio/pronunciationCountStore";

/**
 * Studio's nav column: New video, which starts a Chat thread with the
 * `oculus-studio` chip in its box and lands on its subject picker (the Videos
 * grid's subject highlighted, when one is chosen), then Videos, Components,
 * Themes and Pronunciation with the count of suggestions waiting for review.
 */
export function StudioNav({ panel }: { panel: ReturnType<typeof useSideNavPanel> }) {
  const { collapsed } = panel;
  const newVideo = useStartVideo();
  const pending = usePendingCount();

  return (
    <>
      <SideNav
        aria-label="Studio"
        width={panel.width}
        collapsed={collapsed}
        animate={panel.animate}
        header={<SideNavHeading icon={FilmSlate}>Studio</SideNavHeading>}
      >
        <button type="button" data-side-nav-close onClick={() => newVideo(storedSubject())} className={cn(SIDE_NAV_ROW, SIDE_NAV_ROW_IDLE, "cursor-pointer")}>
          <Plus size={16} className="shrink-0" />
          <span className={cn("min-w-0 flex-1 truncate text-left", SIDE_NAV_FOLDS)}>New video</span>
        </button>
        <SideNavLink to={VIDEOS_HREF} icon={SquaresFour} label="Videos" />
        <SideNavLink to={COMPONENTS_HREF} icon={Cube} label="Components" />
        <SideNavLink to={THEMES_HREF} icon={Palette} label="Themes" />
        <SideNavLink
          to={PRONUNCIATION_HREF}
          icon={Translate}
          label="Pronunciation"
          trailing={pending > 0 ? <NewCountBadge count={pending} /> : null}
        />
      </SideNav>
      {/* On the seam: negative margins cost no layout width. */}
      {!collapsed && (
        <ResizeHandle
          onMouseDown={panel.onMouseDown}
          dragging={panel.dragging}
          label="Resize Studio sidebar"
          className="-mx-0.5"
        />
      )}
    </>
  );
}
