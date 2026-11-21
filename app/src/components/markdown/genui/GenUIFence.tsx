import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useMathsReady } from "@/lib/maths";
import { morph } from "./morph";
import { repairPrefix } from "./repair";
import { sanitize } from "./sanitize";
import "./genui.css";

/** The language tag of a generative-UI fence. */
export const UI_LANG = /(^|\s)language-ui(\s|$)/;

/**
 * A ```ui fence: sanitised markup drawn into the reply's own DOM, updated
 * from the repaired prefix once per animation frame while it streams.
 * Morphing keeps every node already on screen in place across deltas and,
 * because the streaming reply takes its committed row's key, across commit.
 */
export function GenUIFence({ source, closed }: { source: string; closed: boolean }) {
  const ready = useMathsReady();
  const prefix = "gu" + useId().replace(/[^a-z0-9]/gi, "");
  const root = useRef<HTMLDivElement>(null);
  const latest = useRef({ source, closed, ready });
  latest.current = { source, closed, ready };
  const drawn = useRef<string | null>(null);
  const frame = useRef<number | null>(null);

  const draw = () => {
    frame.current = null;
    const el = root.current;
    if (!el) return;
    const { source, closed, ready } = latest.current;
    const stamp = `${closed ? 1 : 0}:${ready ? 1 : 0}:${source}`;
    if (drawn.current === stamp) return;
    drawn.current = stamp;
    const markup = closed ? source : repairPrefix(source);
    const next = sanitize(markup, prefix);
    morph(el, next);
    el.toggleAttribute("data-empty", !el.firstElementChild && !el.textContent?.trim());
  };

  // A closed fence draws in the commit that closed it; a streaming one waits
  // for the frame, so deltas inside one frame draw once.
  useLayoutEffect(() => {
    if (closed) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      draw();
    } else if (frame.current === null) {
      frame.current = requestAnimationFrame(draw);
    }
  });
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  return (
    <div
      ref={root}
      className="genui"
      data-md={source ? `\`\`\`ui\n${source}\n\`\`\`` : undefined}
      data-streaming={closed ? undefined : ""}
      data-ready={ready ? "" : undefined}
    />
  );
}
