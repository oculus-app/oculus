import { describe, expect, test } from "bun:test";

import { planGridMotion, type Box } from "@/lib/ui/gridMotion";

/** A 3-column grid of 100×80 cells with no gaps: cell `i`'s box. */
const at = (i: number): Box => ({ x: (i % 3) * 100, y: Math.floor(i / 3) * 80, w: 100, h: 80 });
const layout = (cells: string[]) => new Map(cells.map((cell, i) => [cell, at(i)]));

describe("planGridMotion", () => {
  test("opening a folder deals its parts out of it and moves what follows", () => {
    const plan = planGridMotion(layout(["folder", "a", "b"]), layout(["folder", "p1", "p2", "a", "b"]));
    // Each part starts on the folder, one and two columns back.
    expect(plan.entered).toEqual([
      { cell: "p1", dx: -100, dy: 0, nth: 0 },
      { cell: "p2", dx: -200, dy: 0, nth: 1 },
    ]);
    // "a" wrapped from the first row's second column to the second row's first.
    expect(plan.moved).toEqual([
      { cell: "a", dx: 100, dy: -80 },
      { cell: "b", dx: 100, dy: -80 },
    ]);
    expect(plan.left).toEqual([]);
  });

  test("closing it leaves the parts where they were and moves what follows back", () => {
    const plan = planGridMotion(layout(["x", "folder", "p1", "p2", "a"]), layout(["x", "folder", "a"]));
    expect(plan.left).toEqual([
      { cell: "p1", box: at(2) },
      { cell: "p2", box: at(3) },
    ]);
    expect(plan.moved).toEqual([{ cell: "a", dx: -100, dy: 80 }]);
    expect(plan.entered).toEqual([]);
  });

  test("each folder's parts count from their own folder, and a cell that stays put is left alone", () => {
    const plan = planGridMotion(layout(["f1", "f2"]), layout(["f1", "p1", "f2", "q1", "q2"]));
    expect(plan.entered.map((e) => [e.cell, e.nth])).toEqual([["p1", 0], ["q1", 0], ["q2", 1]]);
    expect(plan.moved.map((m) => m.cell)).toEqual(["f2"]);
  });

  test("a cell with nothing before it stays where it is", () => {
    expect(planGridMotion(layout([]), layout(["new"])).entered).toEqual([{ cell: "new", dx: 0, dy: 0, nth: 0 }]);
    expect(planGridMotion(layout(["old"]), layout([])).left).toEqual([{ cell: "old", box: at(0) }]);
  });
});
