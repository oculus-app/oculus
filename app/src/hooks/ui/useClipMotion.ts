import { useLayoutEffect, useRef, type RefObject } from "react";
import { CLOSE_MS, EASE, OPEN_MS, skipMotion } from "./useFoldMotion";

/**
 * Show more and Show less on a clipped block (`max-height` while folded),
 * easing its height between the clip and the whole with a fold's timing
 * (`useFoldMotion`). Call `animateNext` before the state flips: it reads the
 * height the block has now, and the next change of `open` plays from it.
 */
export function useClipMotion(ref: RefObject<HTMLElement | null>, open: boolean) {
  const from = useRef<number | null>(null);

  const animateNext = () => {
    if (!skipMotion() && ref.current) from.current = ref.current.offsetHeight;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    const start = from.current;
    from.current = null;
    if (!el || start == null) return;
    const end = el.offsetHeight;
    if (end === start) return;
    el.style.overflow = "hidden";
    // An animation outranks the inline `max-height` of the clip.
    const anim = el.animate(
      [
        { height: `${start}px`, maxHeight: "none" },
        { height: `${end}px`, maxHeight: "none" },
      ],
      { duration: open ? OPEN_MS : CLOSE_MS, easing: EASE },
    );
    const done = () => {
      el.style.overflow = "";
    };
    anim.onfinish = done;
    return () => {
      anim.onfinish = null;
      anim.cancel();
      done();
    };
  }, [open, ref]);

  return animateNext;
}
