import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { useMathsReady } from "@/lib/maths";
import { useWidgetRow } from "@/components/markdown/openui/state";
import { entryState, genuiKey, useWidgetStore } from "@/stores/chat/widgetStore";
import { morph } from "./morph";
import { repairPrefix } from "./repair";
import { BlockRuntime } from "./runtime";
import { sanitize } from "./sanitize";
import "./genui.css";
import "./controls.css";

/** The language tag of a generative-UI fence. */
export const UI_LANG = /(^|\s)language-ui(\s|$)/;

/**
 * A ```ui fence: sanitised markup drawn into the reply's own DOM, updated
 * from the repaired prefix once per animation frame while it streams.
 * Morphing keeps every node already on screen in place across deltas and,
 * because the streaming reply takes its committed row's key, across commit.
 */
export function GenUIFence({ source, closed, blockIndex = 0 }: { source: string; closed: boolean; blockIndex?: number }) {
  const ready = useMathsReady();
  const row = useWidgetRow();
  const storeKey = row ? genuiKey(row.thread, row.row, blockIndex) : null;
  const prefix = "gu" + useId().replace(/[^a-z0-9]/gi, "");
  const root = useRef<HTMLDivElement>(null);
  const runtime = useRef<BlockRuntime | null>(null);
  const latest = useRef({ source, closed, ready, storeKey });
  latest.current = { source, closed, ready, storeKey };
  const drawn = useRef<string | null>(null);
  const hydrated = useRef<string | null>(null);
  const prevKey = useRef<string | null>(null);
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
    runtime.current?.apply();
    el.toggleAttribute("data-empty", !el.firstElementChild && !el.textContent?.trim());
  };

  useLayoutEffect(() => {
    const el = root.current!;
    const rt = new BlockRuntime(el, () => {
      const { closed, storeKey, source } = latest.current;
      if (closed && storeKey) useWidgetStore.getState().save(storeKey, source, rt.state());
    });
    runtime.current = rt;
    return () => {
      rt.destroy();
      runtime.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    rt.setInert(!closed);
    if (closed && storeKey) {
      const sig = `${storeKey}\0${source}`;
      if (hydrated.current !== sig) {
        const hadLocalPicks = prevKey.current === null && Object.keys(rt.state()).length > 0;
        hydrated.current = sig;
        if (hadLocalPicks) {
          useWidgetStore.getState().save(storeKey, source, rt.state());
        } else {
          rt.hydrate(entryState(useWidgetStore.getState().entries[storeKey], source));
        }
      }
    } else if (!closed) {
      hydrated.current = null;
    }
    prevKey.current = storeKey;
  }, [closed, storeKey, source]);

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
