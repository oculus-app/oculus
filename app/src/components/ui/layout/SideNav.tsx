import { useRef, useState, type ReactNode, type Ref, type TransitionEvent } from "react";
import { NavLink } from "react-router-dom";
import { MagnifyingGlass, SidebarSimple, X, type Icon } from "@phosphor-icons/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { cn } from "@/lib/utils";

/** A nav row's look; exported for rows that are not links (search results). */
export const SIDE_NAV_ROW =
  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors";
export const SIDE_NAV_ROW_IDLE =
  "text-muted-foreground font-normal hover:bg-sidebar-item-hover hover:text-foreground";
export const SIDE_NAV_ROW_ACTIVE = "bg-sidebar-item-active text-foreground font-medium";

/** Fades a label out while the column folds away, and back in as it opens. */
export const SIDE_NAV_FOLDS =
  "transition-opacity will-change-[opacity] duration-150 group-data-[collapsed=true]/nav:opacity-0";

/**
 * A page's own nav column beside its content: `header` stays pinned and
 * `children` scroll under it, with the scrollbar hidden like the app
 * sidebar's and the fades carrying the affordance. `width` makes it the
 * caller's (a resizable column); `collapsed` folds it away to nothing, the
 * way back being `SideNavCollapseToggle` in the page's header.
 */
export function SideNav({
  header,
  width,
  collapsed = false,
  animate = false,
  fill = false,
  children,
  "aria-label": ariaLabel,
}: {
  header: ReactNode;
  /** Drawn width in px; 208 when unset. */
  width?: number;
  collapsed?: boolean;
  /** Ease width changes (a fold); off while dragging. */
  animate?: boolean;
  /** Children in a flex column at least the scroller's height, so a section
   *  with `margin-top: auto` sits at the bottom while the list is short. */
  fill?: boolean;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollFade(scrollRef);

  // While it folds, and while folded, the content keeps its open width and
  // the easing edge only clips it: laid out at every width on the way, each
  // row reflowed and repainted per frame, and an unfold dropped frames.
  const openWidth = useRef(width);
  if (!collapsed && width) openWidth.current = width;
  const [easing, setEasing] = useState(false);
  const [wasCollapsed, setWasCollapsed] = useState(collapsed);
  if (wasCollapsed !== collapsed) {
    setWasCollapsed(collapsed);
    setEasing(animate);
  }
  const eased = (e: TransitionEvent) => {
    if (e.target === e.currentTarget && e.propertyName === "width") setEasing(false);
  };
  const held = (collapsed || easing) && openWidth.current ? openWidth.current : undefined;

  return (
    <nav
      aria-label={ariaLabel}
      data-collapsed={collapsed}
      // A zero-width column is gone: no seam border, nothing to tab into.
      inert={width === 0}
      style={width == null ? undefined : { width }}
      onTransitionEnd={eased}
      onTransitionCancel={eased}
      className={cn(
        // The seam is drawn over the edge, not a border: a border's width snaps
        // to device pixels at a fractional zoom, and content held at the
        // open width less 1px settled a device pixel off, jittering its icons.
        "group/nav relative h-full shrink-0 overflow-hidden bg-background",
        "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border-subtle",
        width == null && "w-52",
        width === 0 && "after:hidden",
        animate && "transition-[width] duration-200 ease-out",
      )}
    >
      <div style={held ? { width: held } : undefined} className={cn("flex h-full flex-col", !held && "w-full")}>
        <div className="shrink-0">{header}</div>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 pt-1 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* One wrapper: the fade's ResizeObserver watches the first child. */}
          <div className={cn(fill && "flex min-h-full flex-col")}>{children}</div>
        </div>
      </div>
    </nav>
  );
}

/** A consistent title and glyph at the top of a section's nav column. */
export function SideNavHeading({ icon: Icon, children }: { icon: Icon; children: ReactNode }) {
  return <div className="px-4 pt-4 pb-3">
    <div className="-mx-2 flex items-center gap-2.5 px-2 py-1">
      <Icon size={16} className="shrink-0 text-foreground" />
      <h1 className={cn("min-w-0 flex-1 truncate font-display text-[16px] font-semibold leading-none tracking-tight text-foreground", SIDE_NAV_FOLDS)}>{children}</h1>
    </div>
  </div>;
}

/** Folds or unfolds the column, from the page's header row beside its title,
 *  so it stays in one place in both states. */
export function SideNavCollapseToggle({
  panel: { collapsed, toggle, shortcut },
}: {
  /** `useSideNavPanel` binds a fold key and names it in `shortcut`. */
  panel: { collapsed: boolean; toggle: () => void; shortcut?: string };
}) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={!collapsed}
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
        >
          <SidebarSimple size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{shortcut ? `${label} (${shortcut})` : label}</TooltipContent>
    </Tooltip>
  );
}

/** A route row; `trailing` sits at the row's end (a count badge). */
export function SideNavLink({
  to,
  end,
  icon: RowIcon,
  label,
  trailing,
}: {
  to: string;
  end?: boolean;
  icon: Icon;
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cn(SIDE_NAV_ROW, isActive ? SIDE_NAV_ROW_ACTIVE : SIDE_NAV_ROW_IDLE)}
    >
      <RowIcon size={16} className="shrink-0" />
      <span className={cn("min-w-0 flex-1 truncate", SIDE_NAV_FOLDS)}>{label}</span>
      {trailing && <span className={cn("flex shrink-0", SIDE_NAV_FOLDS)}>{trailing}</span>}
    </NavLink>
  );
}

/** The pill search field under a column's header. Escape clears it and Enter
 *  calls `onEnter` (the caller opens its first result). */
export function SideNavSearch({
  value,
  onChange,
  onEnter,
  placeholder,
  inputRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  placeholder: string;
  inputRef?: Ref<HTMLInputElement>;
  /** The wrapper's, replacing its padding where the field shares a row. */
  className?: string;
}) {
  return (
    <div className={cn("px-2 pb-2", className)}>
      <div
        className={cn(
          "flex h-8 items-center gap-2 rounded-full border border-input bg-card px-3 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25",
          SIDE_NAV_FOLDS,
        )}
      >
        <MagnifyingGlass size={13} className="shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              onChange("");
            } else if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
          >
            <X size={11} weight="bold" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SideNavGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-1 mb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}
