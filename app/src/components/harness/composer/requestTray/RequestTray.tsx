import { useEffect, useRef } from "react";
import { useTabActive, useTabId } from "@/components/tabs/TabContext";
import { typingTarget } from "@/lib/harness";
import { activePane } from "@/stores/shell/tabStore";
import { useRequestReveal } from "@/stores/chat/requestReveal";
import { paneTakesDigit } from "../QuestionPanel";
import { RequestTrayView } from "./RequestTrayView";
import type { RequestTrayState } from "./useRequestTray";

/**
 * The approval tray on top of the composer, from `useRequestTray`. Enter
 * and Escape answer it from here while focus is on nothing or inside the
 * tray, in the focused pane of the tab in front (the question tray's rule);
 * the composer's editor passes its own keys to `tray.press`.
 */
export function RequestTray({ tray }: { tray: RequestTrayState }) {
  const root = useRef<HTMLDivElement>(null);
  const active = useTabActive();
  const paneId = useTabId();
  const reveal = useRequestReveal((s) => s.reveal);
  const latest = useRef(tray);
  latest.current = tray;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!paneTakesDigit(paneId, activePane()?.id)) return;
      if (typingTarget(e.target as HTMLElement | null)) return;
      const focus = document.activeElement;
      const free = focus == null || focus === document.body || !!root.current?.contains(focus);
      if (!free) return;
      // Enter on a focused button in the tray presses that button.
      if (e.key === "Enter" && focus instanceof Element && focus !== root.current && focus.closest("button, a, [role=button]")) return;
      if (latest.current.press(e, e.isComposing, { focus: "free", draftEmpty: true, menuOpen: false })) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, paneId]);

  return (
    <RequestTrayView
      rootRef={root}
      request={tray.request}
      count={tray.count}
      busy={tray.busy}
      error={tray.error}
      onRespond={tray.respond}
      onReveal={() => reveal(tray.request.id)}
    />
  );
}
