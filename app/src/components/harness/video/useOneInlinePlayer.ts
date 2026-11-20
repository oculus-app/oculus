import { useEffect } from "react";

/** The open inline player's close, app-wide. */
let open: (() => void) | null = null;

/**
 * One inline player at a time: opening one closes the one open before it,
 * so a single player answers the media keys (each `useMediaPlayer` listens
 * on the window) and only one picture sits in the chats. `close` must be
 * stable.
 */
export function useOneInlinePlayer(playing: boolean, close: () => void): void {
  useEffect(() => {
    if (!playing) return;
    const before = open;
    open = close;
    if (before && before !== close) before();
    return () => {
      if (open === close) open = null;
    };
  }, [playing, close]);
}
