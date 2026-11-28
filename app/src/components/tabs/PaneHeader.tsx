import {
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AppWindow } from "@phosphor-icons/react";
import { useTabInfo } from "@/components/tabs/tabInfo";
import { Breadcrumb, BreadcrumbItems, type BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { frontOf, type SidePanel } from "@/lib/shell/sideStack";
import { cn } from "@/lib/utils";

/**
 * A page's top row, and the part of it the side panel's header shows. In the
 * main pane the row is the page's own: nav toggle, trail, buttons. In the
 * side panel `SidePanelHeader` is the one title row, the same on every page:
 * `TabPane` gives the pane the header's two places (`HeaderSlots`), the
 * page's trail (`PaneTrail`, `PaneBreadcrumb`) portals into the first as
 * crumbs, and its lone icon buttons (`PaneIconActions`) into the second,
 * before expand and ×. What is left of the row, the page's wide controls,
 * stays under the header as its own row, and is gone when there are none.
 * The trail lands in a layout effect, so the header shows the item's title
 * until the page mounts (a lazy route's `LoadingFill`) and the trail before
 * the page first paints.
 */

/** The side panel header's two places a page fills. */
export interface HeaderSlots {
  subscribe: (listener: () => void) => () => void;
  /** After the switcher: the page's nav toggle and trail. */
  trail: () => HTMLElement | null;
  /** Before expand: the page's icon buttons. */
  actions: () => HTMLElement | null;
  setTrail: (el: HTMLElement | null) => void;
  setActions: (el: HTMLElement | null) => void;
  /** Whether a page's trail stands in for the item's title. */
  filled: () => boolean;
  fill: () => () => void;
}

export function createHeaderSlots(): HeaderSlots {
  let trail: HTMLElement | null = null;
  let actions: HTMLElement | null = null;
  let fills = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    trail: () => trail,
    actions: () => actions,
    setTrail: (el) => {
      trail = el;
      emit();
    },
    setActions: (el) => {
      actions = el;
      emit();
    },
    filled: () => fills > 0,
    fill: () => {
      fills += 1;
      emit();
      return () => {
        fills -= 1;
        emit();
      };
    },
  };
}

export interface SideSlot {
  tabId: number;
  side: SidePanel;
  header: HeaderSlots;
}

const SideSlotContext = createContext<SideSlot | null>(null);

export const SideSlotProvider = SideSlotContext.Provider;

/** Whether this page renders as the side panel's front item. */
export function useInSidePanel(): boolean {
  return useContext(SideSlotContext) != null;
}

/**
 * A page's top row. In the side panel its trail and icon buttons are in the
 * panel's header, so the row holds only the page's wide controls, at its
 * end, and takes no space when it has none.
 */
export function PaneHeaderRow({ className, children }: { className: string; children: ReactNode }) {
  const inSide = useInSidePanel();
  return <div className={cn(className, inSide && "justify-end empty:hidden")}>{children}</div>;
}

/** The common 48px top bar for Chat, Studio and planning pages. */
export function PageHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <PaneHeaderRow className={cn("flex h-12 shrink-0 items-center gap-2.5 border-b border-border-subtle px-6", className)}>{children}</PaneHeaderRow>;
}

interface TrailProps {
  /** Before the trail: the page's nav toggle, a way back. */
  lead?: ReactNode;
  /** Muted after the trail: a count, a series part. */
  meta?: ReactNode;
}

/**
 * A page's trail as small crumbs before its title: the row's `parents`, then
 * `title`. In the side panel they are the header's crumbs, the title under
 * the item's own icon. `shrinkParents` lets long parents truncate before the
 * title does.
 */
export function PaneTrail({ lead, meta, parents = [], title, shrinkParents }: TrailProps & {
  parents?: BreadcrumbItem[];
  title: string;
  shrinkParents?: boolean;
}) {
  const slot = useContext(SideSlotContext);
  if (slot) return <SideTitleTrail slot={slot} lead={lead} meta={meta} parents={parents} title={title} />;
  return (
    <>
      {lead}
      {parents.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className={cn(
            "flex items-center gap-2.5 text-[11px] text-muted-foreground",
            shrinkParents ? "min-w-0 max-w-[45%] shrink" : "shrink-0",
          )}
        >
          <BreadcrumbItems items={parents} trailing />
        </nav>
      )}
      <h1 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
        {title}
        {meta ? <span className="ml-2 font-normal text-muted-foreground tabular-nums">{meta}</span> : null}
      </h1>
    </>
  );
}

/** A page's trail as one `Breadcrumb`, its last item the page itself. */
export function PaneBreadcrumb({ lead, meta, items }: TrailProps & { items: BreadcrumbItem[] }) {
  const slot = useContext(SideSlotContext);
  if (slot) return <SideTrail header={slot.header} lead={lead} meta={meta} items={items} />;
  return (
    <>
      {lead}
      <Breadcrumb items={items} />
      {meta ? <TrailMeta>{meta}</TrailMeta> : null}
    </>
  );
}

/** A page's lone icon buttons (a menu, an info toggle): in the side panel
 *  they sit in the header before expand, never in a row of their own. */
export function PaneIconActions({ children }: { children: ReactNode }) {
  const slot = useContext(SideSlotContext);
  return slot ? <HeaderActions header={slot.header}>{children}</HeaderActions> : <>{children}</>;
}

function HeaderActions({ header, children }: { header: HeaderSlots; children: ReactNode }) {
  const el = useSyncExternalStore(header.subscribe, header.actions);
  return el ? createPortal(children, el) : null;
}

/** `PaneTrail` in the side panel: the title joins the crumbs under the icon
 *  its item has in the switcher, or under none where a parent already shows
 *  that icon (a subject's page after the subject). */
function SideTitleTrail({ slot, lead, meta, parents, title }: TrailProps & {
  slot: SideSlot;
  parents: BreadcrumbItem[];
  title: string;
}) {
  const icon = useTabInfo()(frontOf(slot.side).path, 14).icon ?? <AppWindow size={14} />;
  const repeated = parents.some((parent) => sameIcon(parent.icon, icon));
  return <SideTrail header={slot.header} lead={lead} meta={meta} items={[...parents, { label: title, icon: repeated ? undefined : <>{icon}</> }]} />;
}

/** Whether two icons draw the same thing: one component, equal props. */
function sameIcon(a: ReactNode, b: ReactNode): boolean {
  if (!isValidElement(a) || !isValidElement(b) || a.type !== b.type) return false;
  const pa = a.props as Record<string, unknown>;
  const pb = b.props as Record<string, unknown>;
  const keys = Object.keys(pa);
  return keys.length === Object.keys(pb).length && keys.every((key) => pa[key] === pb[key]);
}

function SideTrail({ header, lead, meta, items }: TrailProps & { header: HeaderSlots; items: BreadcrumbItem[] }) {
  const el = useSyncExternalStore(header.subscribe, header.trail);
  useLayoutEffect(() => header.fill(), [header]);
  if (!el) return null;
  return createPortal(
    <>
      {lead}
      <Breadcrumb items={items} />
      {meta ? <TrailMeta>{meta}</TrailMeta> : null}
    </>,
    el,
  );
}

function TrailMeta({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{children}</span>;
}
