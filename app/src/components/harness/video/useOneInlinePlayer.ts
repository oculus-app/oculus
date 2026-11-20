import { useEffect } from "react";

import { useTabId } from "@/components/tabs/TabContext";

/** Each pane's open inline player, by its close. */
const open = new Map<number, () => void>();

/**
 * One inline player per pane: opening one closes the one open before it in
 * the same pane, so a single player answers that pane's media keys (each
 * `useMediaPlayer` listens on the window, gated on its pane's focus). A
 * player in another tab stays open; the app's one sound pauses it.
 * `close` must be stable.
 */
export function useOneInlinePlayer(playing: boolean, close: () => void): void {
  const pane = useTabId();
  useEffect(() => {
    if (!playing) return;
    const before = open.get(pane);
    open.set(pane, close);
    if (before && before !== close) before();
    return () => {
      if (open.get(pane) === close) open.delete(pane);
    };
  }, [playing, close, pane]);
}
