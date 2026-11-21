/**
 * The outline of a run of consecutive cells in a row-major grid: an open
 * series' folder and its parts. The run can start and end mid-row, so its
 * shape is a staircase, and it changes with the column count.
 */

export interface RunCellEdges {
  /** Sides of this cell that are outer edges of the run's shape. */
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  /** Outer (convex) corners, where two of those edges meet and round. */
  topLeft: boolean;
  topRight: boolean;
  bottomRight: boolean;
  bottomLeft: boolean;
  /** Inside corners: both sides continue the shape and the diagonal cell
   *  does not, so the outline turns inwards at that corner of the cell. */
  innerTopLeft: boolean;
  innerTopRight: boolean;
  innerBottomRight: boolean;
  innerBottomLeft: boolean;
}

/** Edges for each of `count` cells starting at grid index `start` in a grid
 *  of `columns` columns, in order. */
export function gridRunEdges(columns: number, start: number, count: number): RunCellEdges[] {
  const cols = Math.max(1, Math.floor(columns));
  const end = start + count - 1;
  const inRun = (i: number) => i >= start && i <= end;
  const at = (row: number, col: number) => col >= 0 && col < cols && row >= 0 && inRun(row * cols + col);
  return Array.from({ length: Math.max(0, count) }, (_, k) => {
    const i = start + k;
    const row = Math.floor(i / cols);
    const col = i % cols;
    const top = !at(row - 1, col);
    const bottom = !at(row + 1, col);
    const left = !at(row, col - 1);
    const right = !at(row, col + 1);
    return {
      top, right, bottom, left,
      topLeft: top && left,
      topRight: top && right,
      bottomRight: bottom && right,
      bottomLeft: bottom && left,
      innerTopLeft: !top && !left && !at(row - 1, col - 1),
      innerTopRight: !top && !right && !at(row - 1, col + 1),
      innerBottomRight: !bottom && !right && !at(row + 1, col + 1),
      innerBottomLeft: !bottom && !left && !at(row + 1, col - 1),
    };
  });
}

/** How many columns a resolved `grid-template-columns` value holds
 *  ("240px 240px 240px", line names in brackets ignored); "none" is one. */
export function countGridTracks(template: string): number {
  const tracks = template.replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter((t) => t && t !== "none");
  return Math.max(1, tracks.length);
}
