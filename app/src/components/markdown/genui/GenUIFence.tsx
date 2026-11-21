import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useMathsReady } from "@/lib/maths";
import { useWidgetRow } from "@/components/markdown/openui/state";
import { entryState, genuiKey, useWidgetStore } from "@/stores/chat/widgetStore";
import { ChartHost, type ChartAttrs } from "./ChartHost";
import { isChartHost, morph } from "./morph";
import { repairPrefix } from "./repair";
import { BlockRuntime } from "./runtime";
import { sanitize } from "./sanitize";
import "./genui.css";
import "./controls.css";
import "./derive.css";

/** The language tag of a generative-UI fence. */
export const UI_LANG = /(^|\s)language-ui(\s|$)/;

type Chart = { el: Element; key: string; attrs: ChartAttrs };

function sameAttrs(a: ChartAttrs, b: ChartAttrs): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/** Wraps `source` in a backtick fence one longer than its longest backtick run. */
function uiFenceMarkdown(source: string): string {
  let longest = 0;
  for (const m of source.matchAll(/`+/g)) {
    if (m[0].length > longest) longest = m[0].length;
  }
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}ui\n${source}\n${fence}`;
}

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
  const [charts, setCharts] = useState<Chart[]>([]);
  const chartKeys = useRef(new WeakMap<Element, string>());
  const nextChartKey = useRef(0);

  const draw = (inEffect: boolean) => {
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
    const hosts = Array.from(el.querySelectorAll("div[data-chart]")).filter(isChartHost);
    const syncCharts = () =>
      setCharts((prev) => {
        const now = hosts.map((h) => {
          let key = chartKeys.current.get(h);
          if (!key) chartKeys.current.set(h, (key = `c${++nextChartKey.current}`));
          return { el: h, key, attrs: Object.fromEntries(Array.from(h.attributes).map((a) => [a.name, a.value])) };
        });
        const same = now.length === prev.length && now.every((c, i) => c.el === prev[i].el && sameAttrs(c.attrs, prev[i].attrs));
        return same ? prev : now;
      });
    // Flush portals before the frame paints so a newly arrived chart never flashes empty.
    if (inEffect) syncCharts();
    else flushSync(syncCharts);
  };

  useLayoutEffect(() => {
    const el = root.current!;
    drawn.current = null;
    hydrated.current = null;
    prevKey.current = null;
    const rt = new BlockRuntime(el, (name, value) => {
      const { closed, storeKey, source } = latest.current;
      if (closed && storeKey) useWidgetStore.getState().patch(storeKey, source, { [name]: value });
    });
    runtime.current = rt;
    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
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
          useWidgetStore.getState().patch(storeKey, source, rt.state());
        }
        rt.hydrate(entryState(useWidgetStore.getState().entries[storeKey], source));
      }
      prevKey.current = storeKey;
      return useWidgetStore.subscribe((state, prev) => {
        if (state.entries[storeKey] !== prev.entries[storeKey]) {
          rt.hydrate(entryState(state.entries[storeKey], source));
        }
      });
    }
    if (!closed) hydrated.current = null;
    prevKey.current = storeKey;
  }, [closed, storeKey, source]);

  // A closed fence draws in the commit that closed it; a streaming one waits
  // for the frame, so deltas inside one frame draw once.
  useLayoutEffect(() => {
    const stamp = `${closed ? 1 : 0}:${ready ? 1 : 0}:${source}`;
    if (closed) {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
      draw(true);
    } else if (frame.current === null && drawn.current !== stamp) {
      frame.current = requestAnimationFrame(() => draw(false));
    }
  });

  return (
    <>
      <div
        ref={root}
        className="genui"
        data-md={source ? uiFenceMarkdown(source) : undefined}
        data-streaming={closed ? undefined : ""}
        data-ready={ready ? "" : undefined}
      />
      {charts.map((c) => createPortal(<ChartHost attrs={c.attrs} />, c.el, c.key))}
    </>
  );
}
