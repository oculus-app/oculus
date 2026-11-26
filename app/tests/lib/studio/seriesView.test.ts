import { describe, expect, test } from "bun:test";
import type { VideoProgress } from "@/lib/studio/progress";
import {
  partNav, partPageOffer, partRowKind, partsBeingMade, partStatus, partThread, partThreads, seriesStatusLabel, videoPageView,
} from "@/lib/studio/seriesView";
import { seriesForThread } from "@/lib/studio/series";
import type { VideoDetail } from "@/lib/studio/videos";
import { part, series, video } from "./seriesFixtures";

const made = (n: number, modified = n) => part(n, { exists: true, made: true, video: video(`part-${n}`, { modified, seconds: 100 + n }) });
const started = (n: number, modified = n) => part(n, { exists: true, video: video(`part-${n}`, { modified }) });
const fiveParts = () => series({ parts: [made(1), made(2), part(3), part(4), part(5)] });
const progress = (label: string, tone: VideoProgress["tone"]): VideoProgress => ({ label, tone, fraction: null, sweeping: false, steps: [] });

describe("a part's chat", () => {
  test("the chat Make this part opened, else the one linked to its folder", () => {
    expect(partThread(part(3, { exists: true, video: video("part-3", { threadId: 8 }) }), 9)).toBe(9);
    expect(partThread(part(3, { exists: true, video: video("part-3", { threadId: 8 }) }), undefined)).toBe(8);
    expect(partThread(part(3), 9)).toBe(9);
    expect(partThread(part(3, { exists: true, video: video("part-3") }), undefined)).toBeNull();
  });
  test("by part number, a part with none left out", () => {
    const s = series({ parts: [made(1), part(2), part(3)] });
    s.parts[0] = { ...s.parts[0], video: video("part-1", { threadId: 7 }) };
    expect(partThreads(s, { "part-3": 9 })).toEqual({ 1: 7, 3: 9 });
  });
});

describe("which parts are being made", () => {
  test("a part not made whose own chat runs, before or after its folder exists", () => {
    const s = series({ parts: [made(1), started(2), part(3), part(4)] });
    const running = (id: number) => id === 8 || id === 9;
    expect(partsBeingMade(s, { 1: 7, 2: 8, 3: 9, 4: 10 }, running)).toEqual([2, 3]);
  });
  test("a made part is not, though its chat still runs", () => {
    expect(partsBeingMade(series({ parts: [made(1)] }), { 1: 7 }, () => true)).toEqual([]);
  });
  test("a part with no chat is not", () => {
    expect(partsBeingMade(series({ parts: [started(1), part(2)] }), {}, () => true)).toEqual([]);
  });
  test("a part a subagent makes follows the child's chat, and the series' chat keeps part 1", () => {
    const s = series({ parts: [
      { ...made(1), video: video("part-1", { threadId: 7, seconds: 101 }) },
      part(2, { exists: true, video: video("part-2", { threadId: 12 }) }),
      part(3),
    ] });
    expect(seriesForThread([s], 7)?.part.number).toBe(1);
    expect(seriesForThread([s], 12)?.part.number).toBe(2);
    const threads = partThreads(s, {});
    expect(threads).toEqual({ 1: 7, 2: 12 });
    expect(partsBeingMade(s, threads, (id) => id === 12)).toEqual([2]);
    expect(partsBeingMade(s, threads, (id) => id === 7)).toEqual([]);
  });
});

describe("Previous and Next", () => {
  test("skip parts not made, and an off Next names the part after", () => {
    const s = series({ parts: [made(1), part(2), made(3), part(4)] });
    const nav = partNav(s, 3);
    expect(nav.previous?.number).toBe(1);
    expect(nav.next).toBeNull();
    expect(nav.nextOff).toBe("Part 4 isn't made yet");
    expect(nav.previousOff).toBeNull();
  });
  test("work from a part not made", () => {
    const nav = partNav(fiveParts(), 4);
    expect(nav.previous?.number).toBe(2);
    expect(nav.nextOff).toBe("Part 5 isn't made yet");
  });
  test("the ends have nothing to say", () => {
    const s = series({ parts: [made(1), made(2)] });
    expect(partNav(s, 1)).toMatchObject({ previous: null, previousOff: null, next: { number: 2 } });
    expect(partNav(s, 2)).toMatchObject({ next: null, nextOff: null });
  });
});

describe("what a row offers", () => {
  test("Make this part only on the next part not made", () => {
    const s = fiveParts();
    expect(s.parts.map((p) => partRowKind(s, p, []))).toEqual(["made", "made", "make", "none", "none"]);
  });
  test("each part being made says so; the next part offers nothing while it is one of them", () => {
    const s = fiveParts();
    expect(s.parts.map((p) => partRowKind(s, p, [3, 4]))).toEqual(["made", "made", "making", "making", "none"]);
    expect(s.parts.map((p) => partRowKind(s, p, [4]))).toEqual(["made", "made", "make", "making", "none"]);
  });
  test("a later part's own page offers it whatever else is being made", () => {
    const later = fiveParts().parts[3];
    expect(partPageOffer(later, [])).toBe("make");
    expect(partPageOffer(later, [3])).toBe("make");
    expect(partPageOffer(later, [3, 4])).toBe("making");
  });
});

describe("the video page's view", () => {
  const membership = (p = part(3)) => ({ series: fiveParts(), part: p });
  const detail = {} as VideoDetail;
  test("a part not made is decided from the list, folder or not", () => {
    expect(videoPageView({ loaded: true, membership: membership(), detail: null, error: "No such video" })).toBe("unmade");
    expect(videoPageView({ loaded: true, membership: membership(started(3)), detail, error: null })).toBe("unmade");
  });
  test("no error is shown while the list is still loading", () => {
    expect(videoPageView({ loaded: false, membership: null, detail: null, error: "No such video" })).toBe("loading");
    expect(videoPageView({ loaded: true, membership: null, detail: null, error: "No such video" })).toBe("error");
  });
  test("a made part or a single video plays once its detail is read", () => {
    expect(videoPageView({ loaded: true, membership: membership(made(2)), detail: null, error: null })).toBe("loading");
    expect(videoPageView({ loaded: true, membership: membership(made(2)), detail, error: null })).toBe("player");
    expect(videoPageView({ loaded: false, membership: null, detail, error: null })).toBe("player");
  });
});

describe("a part's status", () => {
  test("before its folder exists, its chat has started", () => {
    const idle = progress("Not written yet", "muted");
    expect(partStatus({ part: part(3), making: true, progress: idle })).toEqual({ label: "Starting", tone: "busy" });
    expect(partStatus({ part: part(3), making: false, progress: idle })).toEqual({ label: "Not written yet", tone: "muted" });
  });
  test("once it exists, its video's progress", () => {
    expect(partStatus({ part: started(3), making: true, progress: progress("Writing the script", "busy") }))
      .toEqual({ label: "Writing the script", tone: "busy" });
  });
  test("the card names the part", () => {
    expect(seriesStatusLabel(made(1), 5, { label: "Draft ready", tone: "ok" })).toBe("Part 1/5 ready");
    expect(seriesStatusLabel(part(2), 5, { label: "Narrating", tone: "busy" })).toBe("Part 2/5 · Narrating");
  });
});
