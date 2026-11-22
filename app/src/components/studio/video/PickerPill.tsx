import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A fact that opens a picker: the facts' pill with a caret. Off while
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
      <PopoverContent align="start" collisionPadding={12} className="w-80 p-1.5">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** A picker popover's section title. */
export function PickerLabel({ children }: { children: ReactNode }) {
  return <div className="px-2 pb-1 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground">{children}</div>;
}
