import { cn } from "@/lib/utils";
import { useOverflows } from "@/components/harness/timeline/useOverflows";

/** Past this the tray clips a block: it sits on the composer and must
 *  never push the conversation away. */
export const TRAY_CLIP_H = 140;

/**
 * A code surface in the approval tray, clipped past `TRAY_CLIP_H` with
 * `FoldBlock`'s fading bottom edge and never opened in place: "Show all in
 * the conversation" opens the request's own row instead. `text` is what it
 * shows, so a change re-measures it.
 */
export function TrayClip({
  text,
  onReveal,
  children,
}: {
  text: string;
  onReveal?: () => void;
  children: React.ReactNode;
}) {
  const [body, long] = useOverflows(text, true, TRAY_CLIP_H);
  return (
    <div className="min-w-0">
      <div
        ref={body}
        className={cn(
          "rounded-md bg-card py-1.5",
          long && "overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-2.25rem),transparent)]",
        )}
        style={long ? { maxHeight: TRAY_CLIP_H } : undefined}
      >
        {children}
      </div>
      {long && onReveal && <RevealButton onReveal={onReveal} />}
    </div>
  );
}

/** The quiet way from the tray to the request's row in the timeline. */
export function RevealButton({ onReveal, label = "Show all in the conversation" }: { onReveal: () => void; label?: string }) {
  return (
    <button
      type="button"
      data-copy-skip
      onClick={onReveal}
      className="mt-0.5 cursor-pointer text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {label}
    </button>
  );
}
