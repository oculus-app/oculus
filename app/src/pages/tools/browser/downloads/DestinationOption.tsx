import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One answer in the Save dialog: a radio with its title and a line under it
 * (a hint, or where it saves as a trail), filled brand while chosen, as
 * `NotebookDialog`'s choices are. `control` sits beside the radio rather
 * than inside it, since a button cannot hold one.
 */
export function DestinationOption({
  checked,
  onSelect,
  title,
  hint,
  control,
  disabled,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: ReactNode;
  control?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
        checked ? "border-brand bg-brand/12" : "border-border-subtle hover:bg-accent",
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        disabled={disabled}
        onClick={onSelect}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked ? "border-brand" : "border-input",
          )}
        >
          {checked ? <span className="size-1.5 rounded-full bg-brand" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-[13px] text-foreground">{title}</span>
          {typeof hint === "string" ? <span className="text-[11px] text-muted-foreground">{hint}</span> : hint}
        </span>
      </button>
      {control}
    </div>
  );
}
