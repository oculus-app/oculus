/** The arithmetic of a `Trail`'s glide, in the scroller's own layout pixels
 *  (`scrollLeft`, `offsetLeft`, `clientWidth`), which page zoom leaves alone. */

/** A glide across the whole overflow, whatever the path's length. */
export const GLIDE_MS = 700;

/** Kept clear beside a revealed crumb, so it never sits under the edge fade. */
const REVEAL_MARGIN = 24;

/** CSS `ease`, `cubic-bezier(0.25, 0.1, 0.25, 1)`: progress at time `t` of 0–1. */
export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const curve = (s: number, p1: number, p2: number) => 3 * (1 - s) ** 2 * s * p1 + 3 * (1 - s) * s ** 2 * p2 + s ** 3;
  // x(s) is monotonic, so bisecting for the s whose x is `t` always lands.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (curve(mid, 0.25, 0.25) < t) lo = mid;
    else hi = mid;
  }
  return curve((lo + hi) / 2, 0.1, 1);
}

/** How long a glide from `from` to `to` takes: `GLIDE_MS` across the whole
 *  overflow `span`, and the same share of it from part-way, as a reversed
 *  CSS transition shortens itself. */
export function glideMs(from: number, to: number, span: number): number {
  if (span <= 0) return 0;
  return GLIDE_MS * Math.min(1, Math.abs(to - from) / span);
}

/** Where to scroll so the crumb at `left`, `width` wide, is whole in a view
 *  `view` wide scrolled to `at`: `at` itself when it already is. */
export function revealTarget({ at, left, width, view, max }: {
  at: number;
  left: number;
  width: number;
  view: number;
  max: number;
}): number {
  const start = left - REVEAL_MARGIN;
  const end = left + width + REVEAL_MARGIN - view;
  let to = at;
  // A crumb wider than the view shows its start.
  if (at > start || end > start) to = start;
  else if (at < end) to = end;
  return Math.max(0, Math.min(max, to));
}
