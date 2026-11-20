import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useStoredState } from "@/hooks/ui/useStoredState";
import { threadInfoFloats } from "./layout";

const SHOWN_KEY = "oculus-thread-info-shown";
const readShown = (raw: string | null) => raw === "true";

export interface ThreadInfoState {
  /** The student's choice, remembered; hidden until they show it. */
  shown: boolean;
  /** The pane has room for the floating card (`threadInfoFloats`). */
  floats: boolean;
  /** Drawn floating now: shown, with room. */
  floating: boolean;
  /** The header button's popover, while the pane has no room. */
  popoverOpen: boolean;
  setPopoverOpen: (open: boolean) => void;
  toggle: () => void;
  /** The chat area the card floats in: the timeline's box under the header. */
  areaRef: (el: HTMLDivElement | null) => void;
  /** The card reports its drawn height here, in either form. */
  onCardHeight: (height: number) => void;
  /** The timeline's scrollbar, which the floating card stays clear of. */
  scrollbar: number;
  /** The pane has been drawn at its measured size: from here on the column
   *  eases when the card comes or goes, rather than on the first frame. */
  settled: boolean;
}

/** `scroller` is the timeline's scroller inside the area, the same element
 *  for a new thread and an open one: its width without its scrollbar is what
 *  the column is centred in. Measured before paint, so an open thread draws
 *  with the card in place. */
export function useThreadInfo(scroller: RefObject<HTMLElement | null>): ThreadInfoState {
  const [shown, setShown] = useStoredState(SHOWN_KEY, readShown);
  const [area, areaRef] = useState<HTMLDivElement | null>(null);
  // The box lives in a ref and only what it decides is state: a fold eases
  // the pane's width every frame, and the page must not re-render with it.
  const box = useRef({ width: 0, height: 0 });
  const [fit, setFit] = useState({ measured: false, floats: false, scrollbar: 0 });
  const [cardHeight, onCardHeight] = useState(0);
  const cardRef = useRef(cardHeight);
  cardRef.current = cardHeight;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [settled, setSettled] = useState(false);

  const decide = useCallback((scrollbar?: number) => {
    const { width, height } = box.current;
    const floats = width > 0 && threadInfoFloats(width, height, cardRef.current);
    setFit((f) => {
      const next = { measured: width > 0, floats, scrollbar: scrollbar ?? f.scrollbar };
      return f.measured === next.measured && f.floats === next.floats && f.scrollbar === next.scrollbar ? f : next;
    });
  }, []);

  useLayoutEffect(() => {
    if (!area) return;
    const el = scroller.current;
    const measure = () => {
      box.current = { width: el?.clientWidth ?? area.clientWidth, height: area.clientHeight };
      decide(el ? el.offsetWidth - el.clientWidth : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [area, scroller, decide]);
  useLayoutEffect(() => decide(), [cardHeight, decide]);

  const { measured, floats } = fit;
  useEffect(() => {
    if (!measured) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [measured]);

  // Room came back: the card floats again, and the popover would be a second copy.
  useEffect(() => {
    if (floats) setPopoverOpen(false);
  }, [floats]);

  const toggle = useCallback(() => {
    if (floats) setShown((s) => !s);
    else setPopoverOpen((o) => !o);
  }, [floats, setShown]);

  return {
    shown,
    floats,
    floating: shown && floats,
    popoverOpen,
    setPopoverOpen,
    toggle,
    areaRef,
    onCardHeight,
    scrollbar: fit.scrollbar,
    settled,
  };
}
