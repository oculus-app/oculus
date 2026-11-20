import { useEffect, useState } from "react";

/** `popup-motion`'s exit fade (`styles/utilities.css`). */
export const POPUP_EXIT_MS = 110;

/**
 * Keeps a popup that isn't Radix's mounted through `popup-motion`'s exit:
 * `mounted` stays true for `exitMs` after `open` goes false, and `state` is
 * the `data-state` to draw, which starts the exit animation.
 */
export function usePresence(open: boolean, exitMs = POPUP_EXIT_MS) {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted: open || mounted, state: open ? "open" : "closed" } as const;
}
