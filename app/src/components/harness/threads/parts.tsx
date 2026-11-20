import { cn } from "@/lib/utils";

/** Where a dragged Subject group would drop. */
export function DropLine({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-brand", className)}
    />
  );
}
