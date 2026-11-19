import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * A notice that drops in at the top centre of the window and leaves on its
 * own. Toasts are not a general pattern here (docs/ui.md names the one
 * caller); everything else says its news in place.
 *
 * Portalled to the body and fixed under the tab strip, so it never moves
 * layout. It closes `duration` ms after opening, a timer that pauses while
 * the pointer is over it or focus is in it; × (the caller's) or Escape close
 * it sooner. Only the newest open toast stays: opening one closes the last.
 * Closing plays the exit and then unmounts, showing the last open content.
 */
export function Toast({
  open,
  onClose,
  duration = 6000,
  className,
  children,
}: {
  open: boolean;
  /** Called when the timer runs out, on Escape, or when a newer toast opens. */
  onClose: () => void;
  duration?: number;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  useSyncExternalStore(subscribe, currentOwner, currentOwner);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const shown = useRef(children);
  if (open) shown.current = children;

  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const claimed = useRef(false);
  useEffect(() => {
    if (!open) return;
    claim(id);
    claimed.current = true;
    return () => {
      claimed.current = false;
      release(id);
    };
  }, [open, id]);
  // A newer toast took the slot: this one closes.
  useEffect(() => {
    if (open && claimed.current && owner !== id) closeRef.current();
  });

  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(duration);
  useEffect(() => {
    if (open) remaining.current = duration;
  }, [open, duration]);
  useEffect(() => {
    if (!open || paused) return;
    const started = Date.now();
    // A resumed timer leaves time to finish reading.
    const timer = window.setTimeout(() => closeRef.current(), Math.max(remaining.current, MIN_RESUME_MS));
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [open, paused]);

  if (!open && !mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[3.25rem] z-[100] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-state={open ? "open" : "closed"}
        inert={!open}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeRef.current();
        }}
        className={cn(
          "w-full max-w-[21rem] rounded-xl border border-border-subtle bg-popover text-popover-foreground shadow-lg",
          open ? "toast-enter pointer-events-auto" : "toast-exit",
          className,
        )}
      >
        {shown.current}
      </div>
    </div>,
    document.body,
  );
}

/** Matches the exit animation in `utilities.css`. */
const EXIT_MS = 160;
const MIN_RESUME_MS = 1500;

let owner: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const currentOwner = () => owner;
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function claim(id: string) {
  owner = id;
  notify();
}
function release(id: string) {
  if (owner !== id) return;
  owner = null;
  notify();
}
