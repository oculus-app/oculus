import { useLayoutEffect, type RefObject } from "react";
import { ease, glideMs, revealTarget } from "@/lib/ui/trailGlide";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Keeps a one-line scroller on its end, and glides it: to its start while the
 * pointer is over it, to a crumb focused from the keyboard, and back to the
 * end once neither holds. A sideways wheel takes the scroller over until the
 * pointer leaves. Under reduced motion nothing glides: the scroller only
 * jumps to a focused crumb, and back to its end at rest.
 */
export function useTrailGlide(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia(REDUCED);
    let hovered = false;
    let focusAt: number | null = null;
    let frame = 0;
    // The position last written or seen: `scrollLeft` itself may already
    // hold the engine's own jump to a focused crumb.
    let at = 0;

    const max = () => Math.max(0, el.scrollWidth - el.clientWidth);
    const aim = () => (focusAt !== null ? Math.min(focusAt, max()) : hovered ? 0 : max());
    // The end is the engine's own clamp: `scrollWidth` is a whole number,
    // and under page zoom the content can run a fraction past it.
    const put = (x: number) => {
      el.scrollLeft = x >= max() ? el.scrollWidth : x;
      at = el.scrollLeft;
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const glide = () => {
      stop();
      const from = at;
      const ms = glideMs(from, aim(), max());
      const began = performance.now();
      // The aim is read each frame, so a resize mid-glide still lands on it.
      const step = (now: number) => {
        const t = ms > 0 ? Math.min(1, (now - began) / ms) : 1;
        put(from + (aim() - from) * ease(t));
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };
    const move = () => {
      if (!still.matches) return glide();
      stop();
      if (focusAt !== null || !hovered) put(aim());
    };
    const rest = () => {
      // A focused crumb that was unmounted fires no focusout.
      if (focusAt !== null && !el.contains(document.activeElement)) focusAt = null;
      if (!frame && !hovered && focusAt === null) put(max());
    };

    const enter = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      hovered = true;
      move();
    };
    const leave = () => {
      if (!hovered) return;
      hovered = false;
      move();
    };
    const focusIn = (e: FocusEvent) => {
      const crumb = e.target as HTMLElement;
      if (!crumb.matches(":focus-visible")) return;
      focusAt = revealTarget({ at, left: crumb.offsetLeft, width: crumb.offsetWidth, view: el.clientWidth, max: max() });
      move();
    };
    const focusOut = (e: FocusEvent) => {
      if (focusAt === null || el.contains(e.relatedTarget as Node | null)) return;
      focusAt = null;
      move();
    };
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) stop();
    };
    const seen = () => {
      if (!frame) at = el.scrollLeft;
    };

    rest();
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("focusin", focusIn);
    el.addEventListener("focusout", focusOut);
    el.addEventListener("wheel", wheel, { passive: true });
    el.addEventListener("scroll", seen, { passive: true });
    const ro = new ResizeObserver(rest);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      stop();
      ro.disconnect();
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusin", focusIn);
      el.removeEventListener("focusout", focusOut);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("scroll", seen);
    };
  }, [ref]);
}
