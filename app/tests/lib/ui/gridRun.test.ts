import { describe, expect, test } from "bun:test";

import { countGridTracks, gridRunEdges, type RunCellEdges } from "@/lib/ui/gridRun";

/** A cell's outer sides as "trbl" letters, then its convex corners and inside corners. */
function sides(e: RunCellEdges): string {
  return [e.top && "t", e.right && "r", e.bottom && "b", e.left && "l"].filter(Boolean).join("");
}
function corners(e: RunCellEdges): string {
  return [e.topLeft && "tl", e.topRight && "tr", e.bottomRight && "br", e.bottomLeft && "bl"].filter(Boolean).join(" ");
}
function inner(e: RunCellEdges): string {
  return [e.innerTopLeft && "tl", e.innerTopRight && "tr", e.innerBottomRight && "br", e.innerBottomLeft && "bl"].filter(Boolean).join(" ");
}

describe("gridRunEdges", () => {
  test("a run inside one row is a closed strip", () => {
    const run = gridRunEdges(4, 1, 3);
    expect(run.map(sides)).toEqual(["tbl", "tb", "trb"]);
    expect(run.map(corners)).toEqual(["tl bl", "", "tr br"]);
    expect(run.map(inner)).toEqual(["", "", ""]);
  });

  test("a run starting mid-row steps in at its top left", () => {
    // 3 columns, the folder at index 1 and five parts: the mockup's 1b.
    //   . F 1
    //   2 3 4
    //   5 . .
    const run = gridRunEdges(3, 1, 6);
    expect(run.map(sides)).toEqual(["tl", "tr", "tl", "b", "rb", "rbl"]);
    expect(run.map(corners)).toEqual(["tl", "tr", "tl", "", "br", "br bl"]);
    // Part 3 (under the folder) turns in round the empty first cell; part 2
    // turns in round the cell after part 5.
    expect(run.map(inner)).toEqual(["", "", "br", "tl", "", ""]);
  });

  test("a run ending mid-row steps in at its bottom right", () => {
    //   F 1 2
    //   3 . .
    const run = gridRunEdges(3, 0, 4);
    expect(run.map(sides)).toEqual(["tl", "tb", "trb", "rbl"]);
    expect(run.map(corners)).toEqual(["tl", "", "tr br", "br bl"]);
    expect(run.map(inner)).toEqual(["br", "", "", ""]);
  });

  test("a run that starts and ends mid-row has both inside corners", () => {
    //   . . F
    //   1 2 3
    //   4 . .
    const run = gridRunEdges(3, 2, 5);
    expect(run.map(sides)).toEqual(["trl", "tl", "tb", "rb", "rbl"]);
    expect(run.map(corners)).toEqual(["tl tr", "tl", "", "br", "br bl"]);
    expect(run.map(inner)).toEqual(["", "br", "", "tl", ""]);
  });

  test("a single column stacks closed sides and rounds only the ends", () => {
    const run = gridRunEdges(1, 2, 3);
    expect(run.map(sides)).toEqual(["trl", "rl", "rbl"]);
    expect(run.map(corners)).toEqual(["tl tr", "", "br bl"]);
    expect(run.map(inner)).toEqual(["", "", ""]);
  });

  test("whole rows make a rectangle", () => {
    //   F 1 2
    //   3 4 5
    const run = gridRunEdges(3, 3, 6);
    expect(run.map(sides)).toEqual(["tl", "t", "tr", "bl", "b", "rb"]);
    expect(run.map(corners)).toEqual(["tl", "", "tr", "bl", "", "br"]);
    expect(run.map(inner).every((c) => c === "")).toBe(true);
  });

  test("a folder with one part is a two-cell strip, or a two-cell column when it wraps", () => {
    expect(gridRunEdges(3, 0, 2).map(sides)).toEqual(["tbl", "trb"]);
    // Folder last in its row: the part opens the next row.
    const wrapped = gridRunEdges(3, 2, 2);
    expect(wrapped.map(sides)).toEqual(["trbl", "trbl"]);
    expect(wrapped.map(corners)).toEqual(["tl tr br bl", "tl tr br bl"]);
  });

  test("a closed folder alone is one rounded cell", () => {
    expect(gridRunEdges(4, 5, 1).map(corners)).toEqual(["tl tr br bl"]);
  });

  test("a column count below one is treated as one", () => {
    expect(gridRunEdges(0, 0, 2).map(sides)).toEqual(["trl", "rbl"]);
  });
});

describe("countGridTracks", () => {
  test("counts resolved tracks and ignores line names", () => {
    expect(countGridTracks("240px 240px 240px")).toBe(3);
    expect(countGridTracks("[a] 312.5px [b] 312.5px")).toBe(2);
    expect(countGridTracks("none")).toBe(1);
    expect(countGridTracks("")).toBe(1);
  });
});
