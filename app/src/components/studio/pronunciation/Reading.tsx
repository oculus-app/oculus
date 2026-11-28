import { cn } from "@/lib/utils";

/** A lexicon value or phonemes, in the code font: a respelling or
 *  `/phonemes/` is read character by character. */
export function Reading({ children, chip = false, className }: {
  children: string;
  /** On a tint, as a reading set against its word. */
  chip?: boolean;
  className?: string;
}) {
  return (
    <span
      data-selectable
      className={cn(
        "font-mono text-[12px] break-all",
        chip && "rounded-md bg-surface px-1.5 py-px text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
