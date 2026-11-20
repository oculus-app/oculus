import { Cube, FilmSlate, Palette, Plus, SquaresFour } from "@phosphor-icons/react";

import { ALL, readSubject, SUBJECT_KEY } from "@/components/studio/videos/SubjectPills";
import { ResizeHandle } from "@/components/ui/layout/ResizeHandle";
import {
  SIDE_NAV_FOLDS,
  SIDE_NAV_ROW,
  SIDE_NAV_ROW_IDLE,
  SideNav,
  SideNavHeading,
  SideNavLink,
} from "@/components/ui/layout/SideNav";
import type { useResizablePanel } from "@/hooks/gestures/useResizablePanel";
import { useNewVideoChat } from "@/hooks/studio/useNewVideoChat";
import { useStoredState } from "@/hooks/ui/useStoredState";
import { COMPONENTS_HREF, THEMES_HREF, VIDEOS_HREF } from "@/lib/studio/routes";
import { cn } from "@/lib/utils";

/**
 * Studio's nav column: New video, which starts a Chat thread with the
 * `oculus-studio` chip in its box (in the Videos grid's subject, when one is
 * chosen), then Videos, Components and Themes.
 */
export function StudioNav({ panel }: { panel: ReturnType<typeof useResizablePanel> }) {
  const { collapsed } = panel;
  const [subject] = useStoredState(SUBJECT_KEY, readSubject);
  const newVideo = useNewVideoChat(subject === ALL ? null : subject);

  return (
    <>
      <SideNav
        aria-label="Studio"
        width={panel.width}
        collapsed={collapsed}
        animate={!panel.dragging}
        header={<SideNavHeading icon={FilmSlate}>Studio</SideNavHeading>}
      >
        <button type="button" data-side-nav-close onClick={() => void newVideo()} className={cn(SIDE_NAV_ROW, SIDE_NAV_ROW_IDLE, "cursor-pointer")}>
          <Plus size={16} className="shrink-0" />
          <span className={cn("min-w-0 flex-1 truncate text-left", SIDE_NAV_FOLDS)}>New video</span>
        </button>
        <SideNavLink to={VIDEOS_HREF} icon={SquaresFour} label="Videos" />
        <SideNavLink to={COMPONENTS_HREF} icon={Cube} label="Components" />
        <SideNavLink to={THEMES_HREF} icon={Palette} label="Themes" />
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
