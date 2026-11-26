import { expect, test } from "bun:test";
import { GLIDE_MS, ease, glideMs, revealTarget } from "@/lib/ui/trailGlide";

test("ease is CSS ease", () => {
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  // A paused `easing: "ease"` animation read back in WebKit.
  expect(ease(0.1)).toBeCloseTo(0.09480, 4);
  expect(ease(0.25)).toBeCloseTo(0.40851, 4);
  expect(ease(0.5)).toBeCloseTo(0.80240, 4);
  expect(ease(0.75)).toBeCloseTo(0.96046, 4);
});

test("a whole glide takes the same time at any length", () => {
  expect(glideMs(120, 0, 120)).toBe(GLIDE_MS);
  expect(glideMs(0, 2400, 2400)).toBe(GLIDE_MS);
});

test("a glide from part-way takes its share, and none with nowhere to go", () => {
  expect(glideMs(30, 120, 120)).toBe(GLIDE_MS * 0.75);
  expect(glideMs(120, 120, 120)).toBe(0);
  expect(glideMs(0, 0, 0)).toBe(0);
});

test("a hidden crumb is brought in with room beside it", () => {
  const view = { view: 200, max: 400 };
  // Cut off on the left: its start comes in, clear of the fade.
  expect(revealTarget({ at: 400, left: 150, width: 60, ...view })).toBe(126);
  // Cut off on the right: its end comes in.
  expect(revealTarget({ at: 0, left: 300, width: 60, ...view })).toBe(184);
  // The first and last crumbs go to the ends.
  expect(revealTarget({ at: 400, left: 0, width: 60, ...view })).toBe(0);
  expect(revealTarget({ at: 0, left: 540, width: 60, ...view })).toBe(400);
});

test("a crumb already whole in view stays put, and one wider than the view shows its start", () => {
  expect(revealTarget({ at: 150, left: 200, width: 60, view: 200, max: 400 })).toBe(150);
  expect(revealTarget({ at: 0, left: 100, width: 300, view: 200, max: 400 })).toBe(76);
});
