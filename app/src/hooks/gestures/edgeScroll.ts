/**
 * Scrolling while something is dragged: a pointer held in the band at a
 * scroller's edge, or past it, scrolls that way, faster the deeper it goes.
 * Every in-window drag runs on this (`useCardDrag`, `useStripReorder`, the
 * chat column's subject groups, a notebook's page list), and every HTML5 drag
 * through `watchHtmlDragScroll`; the whiteboard pans its camera off the same
 * `edgeSpeed` curve.
 */

/** Depth (px) of the band at a scroller's edge that scrolls it. */
const EDGE = 56;

/** Fastest scroll, px per frame, reached at the edge and beyond it. */
const EDGE_SPEED = 16;

export type ScrollAxes = "x" | "y" | "xy";

/**
 * px per frame for a pointer at `p` between `start` and `end` on one axis:
 * eased in across the band so the scroll starts slowly rather than jumping.
 * Negative scrolls towards `start`; 0 outside both bands.
 */
export function edgeSpeed(p: number, start: number, end: number): number {
  const band = Math.min(EDGE, (end - start) / 4);
  if (band <= 0) return 0;
  const back = start + band - p;
  const fwd = p - (end - band);
  const depth = Math.max(back, fwd);
  if (depth <= 0) return 0;
  const speed = Math.ceil(EDGE_SPEED * Math.min(1, depth / band) ** 2);
  return back > 0 ? -speed : speed;
}

const SCROLLS = new Set(["auto", "scroll"]);

/** Every ancestor of `node` (itself included) that scrolls on either axis,
 *  innermost first. */
export function scrollChain(node: Element | null | undefined): HTMLElement[] {
  const chain: HTMLElement[] = [];
  for (let el = node instanceof HTMLElement ? node : node?.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (SCROLLS.has(overflowX) || SCROLLS.has(overflowY)) chain.push(el);
  }
  return chain;
}

/** How far a set of scrollers has moved since they were recorded. */
export interface ScrollTravel {
  /** Summed travel of `chain`'s members since `record`; members never recorded count 0. */
  of: (chain: readonly HTMLElement[]) => { x: number; y: number };
}

export interface EdgeScroll extends ScrollTravel {
  /** The pointer moved: scroll if it sits in a band. */
  at: (x: number, y: number) => void;
  /** Ends the loop and drops the scroll listeners. */
  stop: () => void;
}

/**
 * Edge-scrolls `scrollers` (any order, duplicates fine) for one gesture. Per
 * axis the innermost scroller whose cross-axis span holds the pointer and that
 * can still move takes the scroll, so a board's column scrolls before the
 * board. `onScroll` runs on every scroll of any of them — the edge's, a
 * wheel's — so the caller can re-target what lies under a still pointer.
 */
export function edgeScroll(scrollers: readonly HTMLElement[], axes: ScrollAxes, onScroll: () => void): EdgeScroll {
  const depth = (el: HTMLElement) => {
    let d = 0;
    for (let p = el.parentElement; p; p = p.parentElement) d++;
    return d;
  };
  const list = [...new Set(scrollers)].sort((a, b) => depth(b) - depth(a));
  const origin = new Map(list.map((el) => [el, { left: el.scrollLeft, top: el.scrollTop }]));
  for (const el of list) el.addEventListener("scroll", onScroll, { passive: true });

  let pointer: { x: number; y: number } | null = null;
  let frame = 0;

  /** Scrolls the innermost member that moves on `axis`; whether one did. */
  const step = (axis: "x" | "y", p: { x: number; y: number }): boolean => {
    for (const el of list) {
      const r = el.getBoundingClientRect();
      const across = axis === "y" ? p.x >= r.left && p.x <= r.right : p.y >= r.top && p.y <= r.bottom;
      if (!across) continue;
      const v = axis === "y" ? edgeSpeed(p.y, r.top, r.bottom) : edgeSpeed(p.x, r.left, r.right);
      if (!v) continue;
      if (axis === "y") {
        const before = el.scrollTop;
        el.scrollTop = before + v;
        if (el.scrollTop !== before) return true;
      } else {
        const before = el.scrollLeft;
        el.scrollLeft = before + v;
        if (el.scrollLeft !== before) return true;
      }
    }
    return false;
  };

  // Re-arms while anything still moves; the next pointer move restarts it.
  const tick = () => {
    frame = 0;
    if (!pointer) return;
    const y = axes !== "x" && step("y", pointer);
    const x = axes !== "y" && step("x", pointer);
    if (x || y) frame = requestAnimationFrame(tick);
  };

  return {
    at: (x, y) => {
      pointer = { x, y };
      if (!frame && list.length) frame = requestAnimationFrame(tick);
    },
    of: (chain) => {
      let x = 0;
      let y = 0;
      for (const el of chain) {
        const o = origin.get(el);
        if (!o) continue;
        x += el.scrollLeft - o.left;
        y += el.scrollTop - o.top;
      }
      return { x, y };
    },
    stop: () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      pointer = null;
      for (const el of list) el.removeEventListener("scroll", onScroll);
    },
  };
}

const elementOf = (target: EventTarget | null) =>
  target instanceof Element ? target : target instanceof Node ? target.parentElement : null;

/**
 * Edge scrolling for every HTML5 drag in the window (Drive's entries, a
 * dragged file): WebKit scrolls nothing during one on its own. It scrolls the
 * scrollers under the pointer and those the drag started in, so a pointer
 * held above a list, over its toolbar, still scrolls it up. Returns the
 * cleanup; App installs it once.
 */
export function watchHtmlDragScroll(): () => void {
  let source: HTMLElement[] = [];
  let current: EdgeScroll | null = null;
  let under: HTMLElement | null = null;
  const stop = () => {
    current?.stop();
    current = null;
    under = null;
    source = [];
  };
  const onStart = (e: DragEvent) => {
    stop();
    source = scrollChain(elementOf(e.target));
  };
  const onOver = (e: DragEvent) => {
    const chain = scrollChain(elementOf(e.target));
    // A new scroller under the pointer: start over with it and the source's.
    if (!current || (chain[0] ?? null) !== under) {
      current?.stop();
      current = edgeScroll([...chain, ...source], "xy", () => {});
      under = chain[0] ?? null;
    }
    current.at(e.clientX, e.clientY);
  };
  // Leaving the window stops it: dragend never comes for a drag that started
  // outside. By position, since WebKit leaves a drag's `relatedTarget` null.
  const onLeave = (e: DragEvent) => {
    const { clientX: x, clientY: y } = e;
    if (x <= 0 || y <= 0 || x >= window.innerWidth || y >= window.innerHeight) stop();
  };
  const types = { dragstart: onStart, dragover: onOver, dragleave: onLeave, dragend: stop, drop: stop } as const;
  for (const [type, fn] of Object.entries(types)) window.addEventListener(type, fn as EventListener, true);
  return () => {
    for (const [type, fn] of Object.entries(types)) window.removeEventListener(type, fn as EventListener, true);
    stop();
  };
}
