// Contact sheet: one frame every `step` seconds from `start`, 300 px wide,
// laid row by row on a grey grid and written as a JPEG.
import { eachFrame, probe, type Tools } from "./ffmpeg";

const TILE_W = 300;
const PAD = 3;
const GREY = 128;

export type SheetOptions = { start: number; step: number; cols: number; rows: number };

export async function sheet(tools: Tools, path: string, out: string, o: SheetOptions): Promise<number> {
  const { width, height } = probe(tools, path);
  // Even height keeping the aspect, as ffmpeg's `scale=300:-2`.
  const tileH = 2 * Math.round((TILE_W * height) / width / 2);
  const W = o.cols * TILE_W + (o.cols - 1) * PAD;
  const H = o.rows * tileH + (o.rows - 1) * PAD;
  const grid = new Uint8Array(W * H * 3).fill(GREY);
  const tile = TILE_W * tileH * 3;
  let placed = 0;
  const count = await eachFrame(
    tools,
    ["-ss", String(o.start), "-i", path, "-an", "-vf", `fps=1/${o.step},scale=${TILE_W}:${tileH},format=rgb24`, "-frames:v", String(o.cols * o.rows)],
    tile,
    (frame) => place(grid, W, frame, tileH, placed++, o.cols),
  );
  const enc = Bun.spawn(
    [tools.ffmpeg, "-v", "error", "-nostdin", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", "-frames:v", "1", "-q:v", "4", out],
    { stdin: "pipe", stderr: "pipe" },
  );
  enc.stdin.write(grid);
  await enc.stdin.end();
  if ((await enc.exited) !== 0) throw new Error(`ffmpeg could not write ${out}: ${(await new Response(enc.stderr).text()).trim()}`);
  return count;
}

function place(grid: Uint8Array, W: number, frame: Uint8Array, tileH: number, index: number, cols: number) {
  const x0 = (index % cols) * (TILE_W + PAD);
  const y0 = Math.floor(index / cols) * (tileH + PAD);
  for (let y = 0; y < tileH; y++) {
    grid.set(frame.subarray(y * TILE_W * 3, (y + 1) * TILE_W * 3), ((y0 + y) * W + x0) * 3);
  }
}
