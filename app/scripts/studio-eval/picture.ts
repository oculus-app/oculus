// Picture numbers: how much the frame changes from one fifth of a second to the
// next, and how much of a still frame is drawn on. The bottom fifth is cropped
// everywhere, since references burn captions in there.
import { eachFrame, grab, type Tools } from "./ffmpeg";

export const MOTION_FPS = 5;
const MOTION_W = 320;
const MOTION_H = 144;
const CROP = "crop=iw:ih*0.8:0:0";
/** Below this mean luma change (0-255 scale) a step counts as still. */
export const STILL = 0.03;
/** Above this a step is a cut or a whole-frame change. */
export const BIG = 8;
/** A hold is a still run at least this long, in seconds. */
export const HOLD = 3;

/** Mean absolute luma difference between consecutive frames at 5 fps, at
 *  320x144 grey: what `tblend=difference,signalstats` reports as YAVG, rounded
 *  to the same six significant digits. One value fewer than frames. */
export async function motion(tools: Tools, path: string): Promise<number[]> {
  const size = MOTION_W * MOTION_H;
  const prev = new Uint8Array(size);
  const values: number[] = [];
  let first = true;
  await eachFrame(tools, ["-i", path, "-an", "-vf", `fps=${MOTION_FPS},${CROP},scale=${MOTION_W}:${MOTION_H},format=gray`], size, (frame) => {
    if (!first) {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += Math.abs(frame[i] - prev[i]);
      values.push(Number((sum / size).toPrecision(6)));
    }
    prev.set(frame);
    first = false;
  });
  return values;
}

export type PictureStats = {
  /** % of steps that are still. */
  still: number;
  /** Longest still run, seconds. */
  longest: number;
  /** % of the running time spent in holds of HOLD seconds or more. */
  hold3: number;
  /** Motion starting after at least 3 still steps, per minute. */
  events: number;
  /** Median change of the steps that move. */
  mag: number;
  /** Changes crossing BIG, per minute. */
  big: number;
};

export function pictureStats(values: number[], duration: number): PictureStats {
  const dt = 1 / MOTION_FPS;
  const still = values.map((x) => x < STILL);
  const runs: number[] = [];
  let cur = 0;
  for (const s of still) {
    if (s) cur++;
    else {
      if (cur) runs.push(cur * dt);
      cur = 0;
    }
  }
  if (cur) runs.push(cur * dt);
  const holds = runs.filter((r) => r >= HOLD);
  let events = 0;
  for (let i = 3; i < still.length; i++) if (!still[i] && still[i - 1] && still[i - 2] && still[i - 3]) events++;
  const moving = values.filter((x) => x >= STILL).sort((a, b) => a - b);
  let big = 0;
  for (let i = 1; i < values.length; i++) if (values[i] > BIG && values[i - 1] <= BIG) big++;
  return {
    still: still.length ? (100 * still.filter(Boolean).length) / still.length : 0,
    longest: Math.max(0, ...runs),
    hold3: (100 * sum(holds)) / duration,
    events: (events / duration) * 60,
    mag: moving.length ? moving[Math.floor(moving.length / 2)] : 0,
    big: (big / duration) * 60,
  };
}

const FILL_W = 160;
const FILL_H = 72;
/** A pixel this far from the background's luma is ink. */
const INK = 28;

/** How much of one grey frame is drawn on: `fill` is the share of ink pixels,
 *  `box` the share of the frame inside the box holding the middle 96% of them
 *  (2nd to 98th percentile on each axis). The background is the commonest
 *  luma, binned by 8. Under 8 ink pixels the frame counts as empty. */
export function inkOf(gray: Uint8Array, w: number, h: number): { fill: number; box: number } {
  const counts = new Array<number>(32).fill(0);
  const firstSeen = new Array<number>(32).fill(Infinity);
  for (let i = 0; i < gray.length; i++) {
    const bin = gray[i] >> 3;
    counts[bin]++;
    if (firstSeen[bin] === Infinity) firstSeen[bin] = i;
  }
  // Ties go to the bin seen first, as Python's Counter.most_common does.
  let best = 0;
  for (let b = 1; b < 32; b++) if (counts[b] > counts[best] || (counts[b] === counts[best] && firstSeen[b] < firstSeen[best])) best = b;
  const bg = best * 8 + 4;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (Math.abs(gray[i] - bg) > INK) {
      xs.push(i % w);
      ys.push(Math.floor(i / w));
    }
  }
  if (xs.length < 8) return { fill: 0, box: 0 };
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const lo = Math.floor(0.02 * xs.length);
  const hi = Math.floor(0.98 * xs.length) - 1;
  return { fill: xs.length / (w * h), box: ((xs[hi] - xs[lo] + 1) * (ys[hi] - ys[lo] + 1)) / (w * h) };
}

/** Median ink over `n` frames spread evenly through the video, as percentages. */
export function fill(tools: Tools, path: string, duration: number, n = 40): { fill: number; box: number } {
  const fills: number[] = [];
  const boxes: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (duration * (i + 0.5)) / n;
    const raw = grab(tools, path, t, `${CROP},scale=${FILL_W}:${FILL_H},format=gray`);
    if (raw.length < FILL_W * FILL_H) continue;
    const ink = inkOf(raw, FILL_W, FILL_H);
    fills.push(ink.fill);
    boxes.push(ink.box);
  }
  return { fill: 100 * median(fills), box: 100 * median(boxes) };
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** The middle value, or the mean of the middle two; 0 for none. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
