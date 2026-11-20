import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { POPUP_EXIT_MS } from "@/hooks/ui/usePresence";

/**
 * A short notice that needs nothing back: it springs in at the top centre of
 * the window and leaves on its own (docs/ui.md says when one fits).
 *
 * Portalled to the body and fixed below the tab strip and the page's 48px
 * header row, so it never moves layout or covers a title. It closes
 * `duration` ms after opening, a timer that pauses while the pointer is over
 * it or focus is in it; `ToastClose` (a × ringed by that countdown) or
 * Escape close it sooner. Only the newest open toast stays: opening one closes the last.
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
  // Each opening restarts the countdown ring, even before the exit unmounts.
  const opened = useRef(0);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opened.current += 1;
  wasOpen.current = open;

  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), POPUP_EXIT_MS);
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
    const timer = window.setTimeout(() => closeRef.current(), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [open, paused]);

  if (!open && !mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-[6.75rem] z-[100] flex justify-center px-4">
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
          "popup-motion w-full max-w-[21rem] rounded-xl border border-border-subtle bg-popover text-popover-foreground shadow-lg [--popup-origin:top]",
          open && "pointer-events-auto",
          className,
        )}
      >
        <TimerContext.Provider value={{ duration, paused, close: () => closeRef.current(), run: opened.current }}>
          {shown.current}
        </TimerContext.Provider>
      </div>
    </div>,
    document.body,
  );
}


const TimerContext = createContext<{ duration: number; paused: boolean; close: () => void; run: number } | null>(null);

/**
 * The toast's ×, ringed by its countdown: the ring drains clockwise over the
 * toast's `duration` and holds while the timer is paused. The ring is a
 * paint-only stroke animation, so nothing gets its own layer.
 */
export function ToastClose({ label, className }: { label: string; className?: string }) {
  const timer = useContext(TimerContext);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => timer?.close()}
      className={cn(
        "relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      {timer ? (
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute inset-0 size-full -rotate-90">
          <circle cx="12" cy="12" r="10.5" fill="none" strokeWidth="1.5" className="stroke-foreground/10" />
          <circle
            key={timer.run}
            cx="12"
            cy="12"
            r="10.5"
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            className="toast-countdown stroke-muted-foreground"
            style={{ animationDuration: `${timer.duration}ms`, animationPlayState: timer.paused ? "paused" : "running" }}
          />
        </svg>
      ) : null}
      <X size={10} weight="bold" />
    </button>
  );
}

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
