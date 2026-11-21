import { describe, expect, test } from "bun:test";
import {
  madePartCount, madePartNeighbours, nextUnmadePart, seriesForThread,
  seriesPartForSlug, studioGridItems, studioSubjects,
} from "@/lib/studio/series";
import { part, series, video } from "./seriesFixtures";

describe("Studio series data", () => {
  test("only claimed rows fold into a series; orphaned and mismatched videos stay visible", () => {
    const claimed = video("part-1", { series: "motion", modified: 100 });
    const orphan = video("orphan", { series: "missing", modified: 30 });
    const mismatch = video("part-2", { series: "other", modified: 10 });
    const outline = series({ modified: 20, parts: [part(1, { exists: true, video: claimed }), part(2)] });
    const items = studioGridItems({ videos: [claimed, orphan, mismatch, video("last")], series: [outline] });
    expect(items.map((i) => i.kind === "video" ? i.video.slug : i.series.slug)).toEqual(["orphan", "motion", "part-2", "last"]);
    expect(items[1].kind).toBe("series");
  });
  test("the series' subject decides its filter, and outline-only subjects get pills", () => {
    const v = video("part-1", { subject: "OTHER" });
    const list = { videos: [v, video("single", { subject: "MATH" })], series: [series({ parts: [part(1, { video: v })] }), series({ slug: "empty", subject: "CHEM" })] };
    expect(studioSubjects(list)).toEqual(["CHEM", "MATH", "OTHER", "PHYS"]);
    expect(studioGridItems(list, "PHYS")).toEqual([{ kind: "series", series: list.series[0] }]);
    expect(studioGridItems(list, "OTHER")).toEqual([]);
    expect(studioGridItems(list, "MATH")).toHaveLength(1);
  });
  test("membership covers made, scaffold and absent parts, preferring an actual claim", () => {
    const outline = series({ parts: [part(1, { made: true, exists: true, video: video("part-1") }), part(2, { exists: true, video: video("part-2") }), part(3)] });
    for (const p of outline.parts) expect(seriesPartForSlug({ videos: [], series: [outline] }, p.slug)).toEqual({ series: outline, part: p });
    expect(seriesPartForSlug({ videos: [], series: [outline] }, "unknown")).toBeNull();
    expect(seriesPartForSlug({ videos: [], series: [series({ slug: "other", parts: [part(2)] }), outline] }, "part-2")?.series).toBe(outline);
  });
  test("an unrelated video at a reserved slug belongs to no part", () => {
    const outline = series({ parts: [part(1)] });
    for (const owner of [null, "other"]) {
      expect(seriesPartForSlug({ videos: [video("part-1", { series: owner })], series: [outline] }, "part-1")).toBeNull();
    }
  });
  test("navigation skips gaps and counts renders, not folders", () => {
    const outline = series({ parts: [part(1, { made: true }), part(2, { exists: true }), part(3), part(4, { made: true }), part(5)] });
    expect(madePartNeighbours(outline, 2)).toEqual({ previous: outline.parts[0], next: outline.parts[3] });
    expect(madePartNeighbours(outline, 1).previous).toBeNull();
    expect(madePartNeighbours(outline, 5).next).toBeNull();
    expect(madePartCount(outline)).toBe(2);
    expect(nextUnmadePart(outline)).toBe(outline.parts[1]);
    expect(nextUnmadePart(series())).toBeNull();
    expect(nextUnmadePart(series({ parts: [part(1, { made: true })] }))).toBeNull();
    expect(madePartNeighbours(series(), 1)).toEqual({ previous: null, next: null });
  });
  test("thread lookup never matches a deleted or CLI-only thread", () => {
    const outline = series({ threadId: 8 });
    expect(seriesForThread([series(), outline], 8)).toBe(outline);
    expect(seriesForThread([series(), outline], null)).toBeNull();
    expect(seriesForThread([outline], 9)).toBeNull();
  });
  test("ties are deterministic and input arrays stay unchanged", () => {
    const list = { videos: [video("b"), video("a")], series: [series({ slug: "a" })] };
    const before = structuredClone(list);
    expect(studioGridItems(list).map((i) => i.kind)).toEqual(["series", "video", "video"]);
    expect(list).toEqual(before);
  });
});
