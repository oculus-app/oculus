import { describe, expect, test } from "bun:test";
import { edgeSpeed } from "@/hooks/gestures/edgeScroll";

describe("edgeSpeed", () => {
  test("nothing outside the bands", () => {
    expect(edgeSpeed(300, 0, 600)).toBe(0);
    expect(edgeSpeed(57, 0, 600)).toBe(0);
    expect(edgeSpeed(543, 0, 600)).toBe(0);
  });

  test("eases in towards an edge, negative towards the start", () => {
    const shallow = edgeSpeed(560, 0, 600);
    const deep = edgeSpeed(595, 0, 600);
    expect(shallow).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(shallow);
    expect(edgeSpeed(5, 0, 600)).toBe(-deep);
  });

  test("full speed at the edge and past it", () => {
    expect(edgeSpeed(600, 0, 600)).toBe(16);
    expect(edgeSpeed(900, 0, 600)).toBe(16);
    expect(edgeSpeed(-40, 0, 600)).toBe(-16);
  });

  test("a short scroller narrows its bands to a quarter each", () => {
    expect(edgeSpeed(50, 0, 100)).toBe(0);
    expect(edgeSpeed(0, 0, 100)).toBe(-16);
  });
});
