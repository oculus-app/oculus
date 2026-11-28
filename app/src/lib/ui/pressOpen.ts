import type { MouseEvent } from "react";

/**
 * A list row that opens on the press, as a tab does, not on the release. The
 * press keeps focus where it was, so the composer's ring doesn't blink out
 * and back. A ⌘- or ctrl-press leaves the `click` to `newTabClicks.ts`, and
 * Enter or Space (a `click` with no `detail`) still opens.
 */
export function pressOpen(open: () => void) {
  return {
    onMouseDown(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
      // `mousedown`, never `pointerdown`: cancelling that kills WebKit's click.
      e.preventDefault();
      open();
    },
    onClick(e: MouseEvent) {
      if (e.detail === 0) open();
    },
  };
}
