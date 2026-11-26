import { cn } from "@/lib/utils";

/** A key cap inside a control: the palette footer's look (`KeyHint`), or
 *  outlined in the label's colour on a filled button (`fill`). */
export function KeyCap({ children, fill = false, className }: { children: React.ReactNode; fill?: boolean; className?: string }) {
  return (
    <kbd
      className={cn(
        "rounded border px-1 py-0.5 text-[10px] font-normal leading-none tabular-nums",
        fill ? "border-primary-foreground/35 text-primary-foreground/80" : "border-border bg-surface text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
