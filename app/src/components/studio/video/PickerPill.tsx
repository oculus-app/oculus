import type { ReactNode } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A fact that opens a picker: the facts' pill with a caret, over a popover
 * as wide as its rows and no title, since the pill names it. The popover has
 * no padding of its own, so a footer's hairline runs edge to edge. Off while
 * `blocker` says why, as its tooltip; it stays focusable (`aria-disabled`)
 * so the tooltip can show, and simply does not open.
 */
export function PickerPill({
  icon: PillIcon,
  label,
  ariaLabel,
  blocker,
  open,
  onOpenChange,
  children,
}: {
  icon: Icon;
  label: string;
  ariaLabel: string;
  blocker: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The popover's body, mounted only while it is open. */
  children: ReactNode;
}) {
  const off = blocker != null;
  return (
    <Popover open={open && !off} onOpenChange={(next) => onOpenChange(next && !off)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={ariaLabel}
              aria-disabled={off || undefined}
              className="flex h-6 cursor-pointer items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 text-[11.5px] text-muted-foreground outline-none transition-[color,background-color,box-shadow] hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-expanded:bg-accent aria-expanded:text-foreground aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:bg-card aria-disabled:hover:text-muted-foreground"
            >
              <PillIcon size={12} className="shrink-0" />
              <span className="max-w-[14rem] truncate whitespace-nowrap">{label}</span>
              <CaretDown size={10} className="shrink-0" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        {blocker && <TooltipContent>{blocker}</TooltipContent>}
      </Tooltip>
      <PopoverContent align="start" collisionPadding={12} className="w-auto min-w-44 max-w-72 overflow-hidden p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A picker's row, in the model menu's look: full-strength text, lit only
 *  under the pointer or the keyboard, the current one ticked. */
export const PICKER_ROW =
  "flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:opacity-50 disabled:hover:bg-transparent";

/** The tick at a row's end, keeping its place when the row is not current. */
export function PickerCheck({ selected }: { selected: boolean }) {
  return <Check className={cn("ml-auto size-3.5 shrink-0 text-muted-foreground", !selected && "invisible")} />;
}
