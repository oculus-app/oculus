import type { ReactNode } from "react";
import { Info, List, SquaresFour } from "@phosphor-icons/react";
import { FilterChecklist } from "@/components/ui/filter/FilterChecklist";
import { FilterChips, type FilterChip } from "@/components/ui/filter/FilterChips";
import { FilterPopover, FilterRow } from "@/components/ui/filter/FilterPopover";
import {
  KIND_LABEL,
  KINDS,
  MODIFIED_LABEL,
  MODIFIED_RANGES,
  NO_FILTERS,
  SOURCE_LABEL,
  SOURCES,
  type DriveFilters,
  type DriveKind,
  type DriveSource,
} from "@/lib/drive/filters";
import { cn } from "@/lib/utils";
import { DriveSearch } from "./DriveSearch";

export type DriveLayout = "grid" | "list";

const pillLabel = <T extends string>(noun: string, picked: ReadonlySet<T>, labels: Record<T, string>) =>
  picked.size === 0 ? noun : picked.size === 1 ? labels[[...picked][0]] : `${noun} · ${picked.size}`;

/**
 * The browser's controls under its header: on the left the Type, From and
 * Modified pills (any of them, like the search, turns the folder into a flat
 * list of everything below it); on the right the search (`DriveSearch`), the
 * grid/list switch, the details panel's toggle where the pane is wide
 * enough for it, and New (`action`). Under them the applied filters as
 * chips. A fixed 40px row, so switching never moves the entries.
 */
export function DriveToolbar({ filters, onFilters, layout, onLayout, details, placeholder, action }: {
  filters: DriveFilters;
  onFilters: (next: DriveFilters) => void;
  layout: DriveLayout;
  onLayout: (layout: DriveLayout) => void;
  /** The details panel's state; absent where the pane is too narrow for it. */
  details?: { open: boolean; onToggle: () => void };
  /** The search's placeholder, which names its scope. */
  placeholder: string;
  /** New, where the folder takes new files. */
  action?: ReactNode;
}) {
  const set = (patch: Partial<DriveFilters>) => onFilters({ ...filters, ...patch });
  const chips: FilterChip[] = [
    ...[...filters.kinds].map((k) => ({
      key: `kind:${k}`,
      label: KIND_LABEL[k],
      onRemove: () => set({ kinds: without(filters.kinds, k) }),
    })),
    ...[...filters.sources].map((s) => ({
      key: `from:${s}`,
      label: SOURCE_LABEL[s],
      onRemove: () => set({ sources: without(filters.sources, s) }),
    })),
    ...(filters.modified === "any"
      ? []
      : [{ key: "modified", label: MODIFIED_LABEL[filters.modified], onRemove: () => set({ modified: "any" }) }]),
  ];

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-1.5 px-5">
        <FilterPopover label={pillLabel("Type", filters.kinds, KIND_LABEL)} active={filters.kinds.size > 0}>
          {() => (
            <FilterChecklist
              noun="types"
              options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              selected={filters.kinds}
              onChange={(next) => set({ kinds: next as Set<DriveKind> })}
            />
          )}
        </FilterPopover>
        <FilterPopover label={pillLabel("From", filters.sources, SOURCE_LABEL)} active={filters.sources.size > 0}>
          {() => (
            <FilterChecklist
              noun="sources"
              options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
              selected={filters.sources}
              onChange={(next) => set({ sources: next as Set<DriveSource> })}
            />
          )}
        </FilterPopover>
        <FilterPopover
          label={filters.modified === "any" ? "Modified" : MODIFIED_LABEL[filters.modified]}
          active={filters.modified !== "any"}
        >
          {(close) =>
            MODIFIED_RANGES.map((range) => (
              <FilterRow
                key={range}
                label={MODIFIED_LABEL[range]}
                selected={filters.modified === range}
                onPick={() => { set({ modified: range }); close(); }}
              />
            ))
          }
        </FilterPopover>
        <span className="flex-1" />
        <DriveSearch query={filters.query} onQuery={(query) => set({ query })} placeholder={placeholder} />
        <div role="radiogroup" aria-label="View" className="flex shrink-0 items-center rounded-lg border border-border-subtle p-0.5">
          <LayoutButton label="Grid" active={layout === "grid"} onClick={() => onLayout("grid")}>
            <SquaresFour size={14} />
          </LayoutButton>
          <LayoutButton label="List" active={layout === "list"} onClick={() => onLayout("list")}>
            <List size={14} />
          </LayoutButton>
        </div>
        {details && (
          <button
            type="button"
            aria-pressed={details.open}
            aria-label={details.open ? "Hide details" : "Show details"}
            title={details.open ? "Hide details" : "Show details"}
            onClick={details.onToggle}
            className={cn(
              "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors",
              details.open
                ? "border-border-subtle bg-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Info size={15} weight={details.open ? "fill" : "regular"} />
          </button>
        )}
        {action}
      </div>
      <FilterChips chips={chips} onClear={() => onFilters({ ...NO_FILTERS, query: filters.query })} />
    </>
  );
}

function without<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

function LayoutButton({ label, active, onClick, children }: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-6 w-7 cursor-pointer items-center justify-center rounded-md transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
