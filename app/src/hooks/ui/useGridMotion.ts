import { useCallback, useLayoutEffect, useRef } from "react";

import { planGridMotion, type Box } from "@/lib/ui/gridMotion";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const GLIDE_MS = 320;
const DEAL_MS = 340;
const STAGGER_MS = 35;
const TINT_MS = 200;
const LEAVE_MS = 120;
/** How long the cards wait on a close, so the parts are gone before they cross. */
const LEAVE_LEAD_MS = 70;
/** A dealt tile's size at the folder's end of its path. */
const SMALL = 0.92;
/** A cell or tint kept on screen only to play its exit. */
const LEAVING = "data-leaving";
const TINTS = `:scope > :not([${LEAVING}]) > [data-run-tint]:not([${LEAVING}])`;

interface Snapshot {
  boxes: Map<HTMLElement, Box>;
  /** Each run tint and the cell it sits in. */
  tints: Map<HTMLElement, HTMLElement>;
}

/** Layout boxes, which page zoom and scroll leave alone (the grid is
 *  `relative`). `seen` adds a glide in flight, so a second press starts from
 *  where the cell is drawn. */
function measure(root: HTMLElement, seen: boolean): Map<HTMLElement, Box> {
  const boxes = new Map<HTMLElement, Box>();
  for (const el of root.children) {
    if (!(el instanceof HTMLElement) || el.hasAttribute(LEAVING)) continue;
    const box = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    if (seen && el.getAnimations().length > 0) {
      const at = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      box.x += at.m41;
      box.y += at.m42;
    }
    boxes.set(el, box);
  }
  return boxes;
}

function snapshot(root: HTMLElement): Snapshot {
  const tints = new Map<HTMLElement, HTMLElement>();
  for (const tint of root.querySelectorAll<HTMLElement>(TINTS)) {
    if (tint.parentElement) tints.set(tint, tint.parentElement);
  }
  return { boxes: measure(root, true), tints };
}

const stop = (el: Element) => el.getAnimations().forEach((running) => running.cancel());
const dealt = (dx: number, dy: number) => ({ opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(${SMALL})` });
const fadeOut = (el: Element) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LEAVE_MS, easing: "ease-out", fill: "forwards" });

/**
 * Plays the change from `was` to the grid as it is now. Cells that moved
 * glide; a new cell's tile is dealt out of the cell it follows while its tint
 * fades in where it lies, so the run never travels in pieces. React has
 * already removed a cell that left, so its element goes back into the grid
 * out of flow, at its old box and under the others, for a short fade; the
 * glide waits for most of it, so nothing crosses a cell half gone.
 */
function play(root: HTMLElement, was: Snapshot) {
  const plan = planGridMotion(was.boxes, measure(root, false));
  for (const { cell, dx, dy } of plan.moved) {
    stop(cell);
    cell.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: GLIDE_MS,
      delay: plan.left.length > 0 ? LEAVE_LEAD_MS : 0,
      easing: EASE,
      fill: "backwards",
    });
  }
  for (const { cell, dx, dy, nth } of plan.entered) {
    for (const child of cell.children) {
      if (child.matches("[data-run-tint]")) continue;
      child.animate([dealt(dx, dy), { opacity: 1, transform: "none" }], {
        duration: DEAL_MS,
        delay: Math.min(nth, 8) * STAGGER_MS,
        easing: EASE,
        fill: "backwards",
      });
    }
  }
  for (const tint of root.querySelectorAll<HTMLElement>(TINTS)) {
    if (!was.tints.has(tint)) tint.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TINT_MS, easing: "ease-out" });
  }
  for (const { cell, box } of plan.left) {
    cell.setAttribute(LEAVING, "");
    cell.inert = true;
    Object.assign(cell.style, {
      position: "absolute",
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.w}px`,
      height: `${box.h}px`,
      pointerEvents: "none",
    });
    root.prepend(cell);
    for (const child of cell.children) stop(child);
    fadeOut(cell).onfinish = () => cell.remove();
  }
  // A cell that stays but lost its tint (the folder): the tint fades where it was.
  for (const [tint, cell] of was.tints) {
    if (tint.parentNode || !cell.isConnected || cell.hasAttribute(LEAVING)) continue;
    tint.setAttribute(LEAVING, "");
    cell.prepend(tint);
    fadeOut(tint).onfinish = () => tint.remove();
  }
}

/**
 * Animates a grid across one change to its cells (its direct children): call
 * `capture` in the handler that makes the change, before the state is set,
 * and the next commit plays from that snapshot (`play`). Only a captured
 * change moves, so a resize or a reload never does. Nothing moves under
 * reduced motion. Attach `ref` to the grid, which must be `relative`.
 */
export function useGridMotion(): { ref: (el: HTMLElement | null) => void; capture: () => void } {
  const root = useRef<HTMLElement | null>(null);
  const pending = useRef<Snapshot | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    root.current = el;
  }, []);
  const capture = useCallback(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pending.current = snapshot(root.current);
    // A change that commits nothing must not leave its snapshot for a later one.
    requestAnimationFrame(() => {
      pending.current = null;
    });
  }, []);
  useLayoutEffect(() => {
    const was = pending.current;
    pending.current = null;
    if (was && root.current) play(root.current, was);
  });
  return { ref, capture };
}
