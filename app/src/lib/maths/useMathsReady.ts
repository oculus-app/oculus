import { useSyncExternalStore } from "react";
import { mathsReady, onMathsReady } from "./engine";

/** `mathsReady()` for a component that renders maths: it re-renders when the
 *  engine comes up, so maths drawn as a placeholder before then is redrawn.
 *  A `memo` component that runs `rehypeMaths` must call it itself. The third
 *  argument lets a static render (the tests') read it too. */
export function useMathsReady(): boolean {
  return useSyncExternalStore(onMathsReady, mathsReady, mathsReady);
}
