import { describe, expect, test } from "bun:test";
import type { VideoProgress } from "@/lib/studio/progress";
import {
  cardPartNumber, partBeingMade, partNav, partPageOffer, partRowKind, partStatus, seriesStatusLabel, videoPageView,
} from "@/lib/studio/seriesView";
import type { VideoDetail } from "@/lib/studio/videos";
import { part, series, video } from "./seriesFixtures";

const made = (n: number, modified = n) => part(n, { exists: true, made: true, video: video(`part-${n}`, { modified, seconds: 100 + n }) });
const started = (n: number, modified = n) => part(n, { exists: true, video: video(`part-${n}`, { modified }) });
const fiveParts = () => series({ threadId: 7, parts: [made(1), made(2), part(3), part(4), part(5)] });
const progress = (label: string, tone: VideoProgress["tone"]): VideoProgress => ({ label, tone, fraction: null, sweeping: false, steps: [] });

describe("which part is being made", () => {
  test("the part asked for, while it has no render", () => {
    expect(partBeingMade(fiveParts(), 3, false)).toBe(3);
    expect(partBeingMade(fiveParts(), 2, true)).toBeNull();
  });
  test("a folder without a render counts only while the thread works", () => {
    const s = series({ parts: [made(1), started(2, 50), started(3, 10)] });
    expect(partBeingMade(s, null, true)).toBe(2);
    expect(partBeingMade(s, null, false)).toBeNull();
  });
});

describe("the chat card's part", () => {
  test("follows the part being made, even before its folder exists", () => {
    expect(cardPartNumber(fiveParts(), 3)).toBe(3);
  });
  test("otherwise the part whose folder changed last", () => {
    expect(cardPartNumber(series({ parts: [made(1, 90), made(2, 20), part(3)] }), null)).toBe(1);
    expect(cardPartNumber(series({ parts: [made(1, 20), started(2, 30), part(3)] }), null)).toBe(2);
  });
  test("with no folder at all, the first part; with no parts, none", () => {
    expect(cardPartNumber(series({ parts: [part(1), part(2)] }), null)).toBe(1);
    expect(cardPartNumber(series(), null)).toBeNull();
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
    expect(s.parts.map((p) => partRowKind(s, p, null))).toEqual(["made", "made", "make", "none", "none"]);
  });
  test("the part being made says so, and no row offers another", () => {
    const s = fiveParts();
    expect(s.parts.map((p) => partRowKind(s, p, 3))).toEqual(["made", "made", "making", "none", "none"]);
    expect(s.parts.map((p) => partRowKind(s, p, 4))).toEqual(["made", "made", "none", "making", "none"]);
  });
  test("a later part's own page offers it too, unless another part is being made", () => {
    const later = fiveParts().parts[3];
    expect(partPageOffer(later, null)).toEqual({ kind: "make" });
    expect(partPageOffer(later, 4)).toEqual({ kind: "making" });
    expect(partPageOffer(later, 3)).toEqual({ kind: "busy", reason: "Part 3 is being made" });
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
  test("before its folder exists, where the request is", () => {
    const p = part(3);
    const idle = progress("Not written yet", "muted");
    expect(partStatus({ part: p, making: true, sending: true, running: false, progress: idle })).toEqual({ label: "Sending", tone: "busy" });
    expect(partStatus({ part: p, making: true, sending: false, running: true, progress: idle })).toEqual({ label: "Starting", tone: "busy" });
    expect(partStatus({ part: p, making: true, sending: false, running: false, progress: idle })).toEqual({ label: "Asked for", tone: "busy" });
  });
  test("once it exists, its video's progress", () => {
    expect(partStatus({ part: started(3), making: true, sending: false, running: true, progress: progress("Writing the script", "busy") }))
      .toEqual({ label: "Writing the script", tone: "busy" });
  });
  test("the card names the part", () => {
    expect(seriesStatusLabel(made(1), 5, { label: "Draft ready", tone: "ok" })).toBe("Part 1/5 ready");
    expect(seriesStatusLabel(part(2), 5, { label: "Narrating", tone: "busy" })).toBe("Part 2/5 · Narrating");
  });
});
