import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createMemoryRouter, parsePath, RouterProvider } from "react-router-dom";
import { routes } from "@/routes";
import { TabContext } from "@/components/tabs/TabContext";
import { SidePanelHeader } from "@/components/tabs/SidePanelHeader";
import {
  createHeaderSlots,
  SideSlotProvider,
  type HeaderSlots,
  type SideSlot,
} from "@/components/tabs/PaneHeader";
import { ResizeHandle } from "@/components/ui/layout/ResizeHandle";
import { PageFind } from "@/components/ui/search/PageFind";
import { pageKey, routerFor } from "@/lib/shell/tabRouters";
import {
  clampRatio,
  SIDE_RATIO,
  type SideItem,
  type SidePanel,
} from "@/lib/shell/sideStack";
import { cancelRecentTab, recordRecentTab } from "@/stores/shell/recentTabsStore";
import {
  sideFront,
  useTabStore,
  type AppTab,
  type PaneSide,
  type PaneState,
} from "@/stores/shell/tabStore";
import { cn } from "@/lib/utils";

/**
 * One tab's page, and its side panel's front item beside it when open. Each
 * pane owns a memory router; the main pane stays mounted, so switching tabs
 * keeps scroll, drafts and component state.
 *
 * Both pages are columns keyed by `pageKey` and placed with CSS `order`, in
 * a DOM order that never changes: expand swaps them without a remount, and
 * without moving a node, which would reset its scroll.
 */

const TabPane = memo(function TabPane({
  tab,
  active,
}: {
  tab: AppTab;
  active: boolean;
}) {
  const tabId = tab.id;
  const front = sideFront(tab);
  const sideVisible = !!tab.side && !tab.side.hidden;
  const setSideRatio = useTabStore((s) => s.setSideRatio);
  // The ratio on screen mid-drag; the store hears it once, on release.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const stackRef = useRef<HTMLDivElement>(null);
  // The side panel header's place for the front page's trail.
  const [header] = useState(createHeaderSlots);
  const sidePanel = tab.side;
  const slot = useMemo(
    () => (sidePanel ? { tabId, side: sidePanel, header } : null),
    [tabId, sidePanel, header],
  );

  // Detaches a drag in progress; an unmount mid-drag calls it.
  const detachDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => detachDrag.current?.(), []);

  // A fraction, not a width, so the divider holds its place when the stack resizes.
  const onHandleDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.webkitUserSelect = "none";
    let latest: number | null = null;
    // At most one re-render per frame: mouse events outpace the display, and
    // each one re-lays out both panes.
    let frame = 0;
    const onMove = (ev: MouseEvent) => {
      const box = stackRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      latest = clampRatio((ev.clientX - box.left) / box.width);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setDragRatio(latest);
      });
    };
    const detach = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", end);
      cancelAnimationFrame(frame);
      frame = 0;
      document.body.style.cursor = "";
      document.body.style.webkitUserSelect = "";
      detachDrag.current = null;
    };
    const end = () => {
      detach();
      if (latest != null) setSideRatio(tabId, latest);
      setDragRatio(null);
      setDragging(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", end);
    detachDrag.current = detach;
  }, [tabId, setSideRatio]);

  const ratio = dragRatio ?? tab.side?.ratio ?? SIDE_RATIO;
  // Only the front item is mounted; the rest are a path and a router
  // (`lib/shell/tabRouters.ts`).
  const columns: { pane: PaneState | SideItem; side: PaneSide; key: number }[] = [
    { pane: tab, side: "main" as const },
    ...(front ? [{ pane: front, side: "side" as const }] : []),
  ]
    .map((c) => ({ ...c, key: pageKey(c.pane.id) }))
    .sort((a, b) => a.key - b.key);

  return (
    /* Hidden with `visibility`, never `display: none`: display-none zeroes
       every rect, resets scroll and fires ResizeObservers at width 0, losing
       the state panes exist to keep. Stacks are `absolute inset-0` so nothing
       reflows when one comes forward. */
    <div
      ref={stackRef}
      className="absolute inset-0 flex"
      style={{ visibility: active ? "visible" : "hidden" }}
      inert={!active}
    >
      {columns.map(({ pane, side, key }) => (
        <Column
          key={key}
          pane={pane}
          tabId={tabId}
          side={side}
          tabActive={active}
          sideVisible={sideVisible}
          ratio={ratio}
          panel={side === "side" ? tab.side : null}
          slot={side === "side" ? slot : null}
          header={header}
        />
      ))}
      {/* The divider carries the focus marker (indigo edge on the focused
          side): inside a pane, a native browser page's hole would cut it out. */}
      {sideVisible && (
        <ResizeHandle
          onMouseDown={onHandleDown}
          dragging={dragging}
          label="Resize side panel"
          className="order-1 bg-border"
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 w-px bg-brand",
              tab.focus === "main" ? "left-0" : "right-0",
            )}
          />
        </ResizeHandle>
      )}
    </div>
  );
});

export default TabPane;

/**
 * A pane in its place: the main page on the left, or the side panel's front
 * item with the panel's header on the right. One element tree for both, so a
 * page that changes sides keeps its state. Focus is taken on the column, so a
 * click on the side panel's header focuses the panel too.
 */
function Column({
  pane,
  tabId,
  side,
  tabActive,
  sideVisible,
  ratio,
  panel,
  slot,
  header,
}: {
  pane: PaneState | SideItem;
  tabId: number;
  side: PaneSide;
  tabActive: boolean;
  sideVisible: boolean;
  /** The main pane's share of the tab's width. */
  ratio: number;
  /** The side panel, for the column holding its front item. */
  panel: SidePanel | null;
  slot: SideSlot | null;
  header: HeaderSlots;
}) {
  const focusPane = useTabStore((s) => s.focusPane);
  const main = side === "main";
  const shown = main || sideVisible;
  const style: React.CSSProperties | undefined = main
    ? sideVisible
      ? { flex: `0 0 ${ratio * 100}%` }
      : undefined
    : sideVisible
      ? undefined
      : // Keep the front page mounted at its split width while collapsed,
        // preserving drafts and scroll without taking space from main.
        {
          position: "absolute",
          top: 0,
          bottom: 0,
          right: 0,
          width: `${(1 - ratio) * 100}%`,
          visibility: "hidden",
        };
  return (
    <div
      // Capture phase, so focus moves before the clicked control reacts.
      onPointerDownCapture={() => focusPane(tabId, side)}
      onFocusCapture={() => focusPane(tabId, side)}
      className={cn("flex min-w-0 flex-1 flex-col", !main && "order-2")}
      style={style}
      inert={!tabActive || !shown}
    >
      {panel && <SidePanelHeader tabId={tabId} side={panel} header={header} />}
      <SideSlotProvider value={slot}>
        <Pane pane={pane} tabId={tabId} side={side} tabActive={tabActive && shown} />
      </SideSlotProvider>
    </div>
  );
}

/** A pane's first router entry: its path, plus any state the pane was
 *  opened with (`SideItem.entryState`, `AppTab.entryState`). */
function firstEntry(pane: PaneState & { entryState?: unknown }) {
  const state = pane.entryState;
  return state === undefined ? pane.path : { ...parsePath(pane.path), state };
}

/**
 * One pane and its page. The router outlives the mount (`routerFor`), so a
 * side item brought back to the front keeps its history. The pane id keys the
 * router registry, lecture playback and Recent trail.
 */
function Pane({
  pane,
  tabId,
  side,
  tabActive,
}: {
  pane: PaneState | SideItem;
  tabId: number;
  side: PaneSide;
  tabActive: boolean;
}) {
  const id = pane.id;
  const rootRef = useRef<HTMLDivElement>(null);
  // Fetched once per mount, never re-created (that would unmount the page);
  // the pane's path afterwards is an output of this router, not an input.
  const [router] = useState(() =>
    routerFor(id, () =>
      createMemoryRouter(routes, { initialEntries: [firstEntry(pane)] }),
    ),
  );
  const [activeAtMount] = useState(tabActive);

  useEffect(() => {
    // `subscribe` doesn't report the page on show at mount, so it's recorded
    // here — only in the front tab: a reload restores every tab at once.
    const { pathname, search } = router.state.location;
    if (activeAtMount) recordRecentTab(id, pathname + search);
    // A side item sent to the back within the dwell was only passed through.
    return () => cancelRecentTab(id);
  }, [id, router, activeAtMount]);

  const context = useMemo(
    () => ({ id, tabId, side, active: tabActive }),
    [id, tabId, side, tabActive],
  );

  return (
    <div
      ref={rootRef}
      // The page's text selects; the side panel header and shell don't.
      data-select-scope
      // Lets a DOM event find its pane, as the usage pinger does for media.
      data-pane-id={id}
      className="relative min-h-0 min-w-0 flex-1"
    >
      <TabContext.Provider value={context}>
        <RouterProvider router={router} />
      </TabContext.Provider>
      {/* ⌘F's fallback for whatever page the pane shows (`lib/menu/find.ts`). */}
      <PageFind rootRef={rootRef} page={id} />
    </div>
  );
}
