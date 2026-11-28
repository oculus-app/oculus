import {
  createContext,
  isValidElement,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AppWindow } from "@phosphor-icons/react";
import { useTabInfo } from "@/components/tabs/tabInfo";
import { Breadcrumb, BreadcrumbItems, type BreadcrumbItem } from "@/components/ui/Breadcrumb";
import { frontOf, type SidePanel } from "@/lib/shell/sideStack";
import { cn } from "@/lib/utils";

/**
 * A page's chrome. The top row (`PageHeader`, `PaneHeaderRow`) is navigation
 * only: the nav toggle, a way back, the trail and its muted meta. A page's
 * controls sit in the row under it, at its end; a page with no such row gets
 * `PaneToolbar`, and a lone icon button with no row to join floats over the
 * page's top right corner (`PaneCornerAction`). In the side panel
 * `SidePanelHeader` is the one title row, the same on every page: `TabPane`
 * gives the pane the header's place for a trail (`HeaderSlots`), the page's
 * trail (`PaneTrail`, `PaneBreadcrumb`) portals into it as crumbs, and the
 * page's own top row, empty there, takes no space. The trail lands in a
 * layout effect, so the header shows the item's title until the page mounts
 * (a lazy route's `LoadingFill`) and the trail before the page first paints.
 */

/** The side panel header's place a page fills. */
export interface HeaderSlots {
  subscribe: (listener: () => void) => () => void;
  /** After the switcher: the page's nav toggle and trail. */
  trail: () => HTMLElement | null;
  setTrail: (el: HTMLElement | null) => void;
  /** Whether a page's trail stands in for the item's title. */
  filled: () => boolean;
  fill: () => () => void;
}

export function createHeaderSlots(): HeaderSlots {
  let trail: HTMLElement | null = null;
  let fills = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    trail: () => trail,
    setTrail: (el) => {
      trail = el;
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
 * A page's top row: its trail and nothing else. In the side panel the trail
 * is in the panel's header, so the row is empty there and takes no space.
 * A narrow page's nav drawer opens below it (`SideNavShell`).
 */
export function PaneHeaderRow({ className, children }: { className: string; children: ReactNode }) {
  const inSide = useInSidePanel();
  return <div data-pane-header className={cn(className, inSide && "empty:hidden")}>{children}</div>;
}

/** The common 48px top bar for Chat, Studio and planning pages. */
export function PageHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <PaneHeaderRow className={cn("flex h-12 shrink-0 items-center gap-2.5 border-b border-border-subtle px-6", className)}>{children}</PaneHeaderRow>;
}

/**
 * The slim row under a page's header that holds its controls: `children` on
 * the left, `end` at the right end. 36px, the PDF toolbar's height, in the
 * main pane and the side panel alike.
 */
export function PaneToolbar({ children, end, className }: {
  children?: ReactNode;
  end?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-9 shrink-0 items-center gap-3 border-b border-border-subtle px-5", className)}>
      {children != null && <div className="flex min-w-0 items-center gap-2">{children}</div>}
      <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div>
    </div>
  );
}

/**
 * A page's lone icon button where no row under the header has room for it,
 * floating over the top right corner of the nearest positioned box: glass
 * over what is under it (a see-through ground that blurs, as the PDF's zoom)
 * until hovered or focused. Only the pill takes clicks. `style` moves it, as
 * Chat does to clear its scrollbar.
 */
export function PaneCornerAction({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex" style={style}>
      <div className="pointer-events-auto flex items-center rounded-full bg-card/30 p-0.5 backdrop-blur-md transition-colors hover:bg-card/70 has-[:focus-visible]:bg-card/70">
        {children}
      </div>
    </div>
  );
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
