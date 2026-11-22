/** A cell's layout box in its grid's own coordinates. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridMotionPlan<T> {
  /** Cells in both layouts whose place changed, with the offset back to where they were. */
  moved: { cell: T; dx: number; dy: number }[];
  /** New cells, with the offset back to the cell they follow (the folder they
   *  come out of) and their place among the new cells after it. */
  entered: { cell: T; dx: number; dy: number; nth: number }[];
  /** Cells that are gone, and where they were. */
  left: { cell: T; box: Box }[];
}

/**
 * What moves between two layouts of one grid, both in document order. A new
 * cell is anchored on the nearest cell before it that is in both layouts, at
 * its place in `after`; with none before it, it starts where it lies.
 */
export function planGridMotion<T>(before: Map<T, Box>, after: Map<T, Box>): GridMotionPlan<T> {
  const plan: GridMotionPlan<T> = { moved: [], entered: [], left: [] };
  let anchor: Box | null = null;
  let nth = 0;
  for (const [cell, to] of after) {
    const from = before.get(cell);
    if (!from) {
      const origin = anchor ?? to;
      plan.entered.push({ cell, dx: origin.x - to.x, dy: origin.y - to.y, nth: nth++ });
      continue;
    }
    anchor = to;
    nth = 0;
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) plan.moved.push({ cell, dx, dy });
  }
  for (const [cell, box] of before) {
    if (!after.has(cell)) plan.left.push({ cell, box });
  }
  return plan;
}
