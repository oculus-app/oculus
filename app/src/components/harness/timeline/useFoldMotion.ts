import { useLayoutEffect, useRef, useState } from "react";

const OPEN_MS = 200;
const CLOSE_MS = 160;
/** Ease-in-out: a decelerate-only curve leaves a slow tail that reads as the
 *  answer below creeping into place after the fold has finished. */
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function reducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A fold's body growing from its header: its height eases between nothing and
 * its content while the rows fade in and drop a few pixels into place. Only a
 * toggle the student clicks animates (`animateNext` before the state flips);
 * a find or a run's own open draws at once. Shut, the body stays mounted until
 * its close finishes. The row's `ResizeObserver` follows the height each
 * frame, so the timeline's anchoring holds through it.
 */
export function useFoldMotion(open: boolean) {
  const body = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  /** The height an interrupted animation had reached, to carry on from. */
  const reached = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  const animateNext = (next: boolean) => {
    if (reducedMotion()) return;
    pending.current = true;
    if (!next) setClosing(true);
  };

  useLayoutEffect(() => {
    const el = body.current;
    const from = reached.current;
    reached.current = null;
    if (!pending.current || !el) {
      pending.current = false;
      if (!open) setClosing(false);
      return;
    }
    pending.current = false;
    const full = el.scrollHeight;
    const shut = { height: "0px", opacity: 0, transform: "translateY(-4px)" };
    const shown = { height: `${full}px`, opacity: 1, transform: "none" };
    const frames = open
      ? [{ ...shut, height: `${from ?? 0}px` }, shown]
      : [{ ...shown, height: `${from ?? full}px` }, shut];
    el.style.overflow = "hidden";
    // A close holds its end until React unmounts the body, or the body
    // would show at full height for the frame between.
    const anim = el.animate(frames, {
      duration: open ? OPEN_MS : CLOSE_MS,
      easing: EASE,
      fill: open ? "none" : "forwards",
    });
    anim.onfinish = () => {
      if (open) el.style.overflow = "";
      else setClosing(false);
    };
    return () => {
      if (anim.playState === "running") reached.current = el.offsetHeight;
      anim.onfinish = null;
      anim.cancel();
      el.style.overflow = "";
    };
  }, [open]);

  return { body, mounted: open || closing, animateNext };
}
