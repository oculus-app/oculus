// ffmpeg for the measurements. Every filter used here (fps, crop, scale, format)
// is in the app's own LGPL build, so frames come out raw and the maths runs in
// TypeScript rather than in filters that build lacks (tblend, signalstats, tile).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { binaries, exe, hostTriple } from "../runtime.mjs";

export type Tools = { ffmpeg: string; ffprobe: string | null };

function onPath(name: string): string | null {
  return Bun.which(name);
}

/** `--ffmpeg` wins; else the copy `bun run ffmpeg` fetched; else PATH. ffprobe is
 *  optional (the app's build has none) and only sharpens the duration. */
export function findTools(flag?: string): Tools {
  const bundled = join(binaries, `ffmpeg-${hostTriple()}${exe}`);
  const ffmpeg = flag ?? (existsSync(bundled) ? bundled : onPath("ffmpeg"));
  if (!ffmpeg) throw new Error("ffmpeg not found: run `bun run ffmpeg` in app/, install it, or pass --ffmpeg <path>");
  const sibling = join(dirname(ffmpeg), `ffprobe${exe}`);
  return { ffmpeg, ffprobe: existsSync(sibling) ? sibling : onPath("ffprobe") };
}

export type Probe = { duration: number; width: number; height: number };

/** Duration and picture size. ffmpeg's banner gives the duration to 10 ms;
 *  ffprobe, when there is one, gives it exactly. */
export function probe(tools: Tools, path: string): Probe {
  const banner = Bun.spawnSync([tools.ffmpeg, "-hide_banner", "-nostdin", "-i", path], { stderr: "pipe" }).stderr.toString();
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(banner);
  const size = /Stream #.*Video:.*?\b(\d{2,5})x(\d{2,5})\b/.exec(banner);
  if (!d || !size) throw new Error(`could not read ${path}:\n${banner.trim().split("\n").slice(-3).join("\n")}`);
  let duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  if (tools.ffprobe) {
    const out = Bun.spawnSync([tools.ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.toString().trim();
    if (Number.isFinite(Number(out)) && out) duration = Number(out);
  }
  return { duration, width: Number(size[1]), height: Number(size[2]) };
}

/** Run ffmpeg writing raw frames of `frameBytes` to stdout and hand each one to
 *  `onFrame` as it arrives; the buffer is reused, so copy what you keep. */
export async function eachFrame(tools: Tools, args: string[], frameBytes: number, onFrame: (frame: Uint8Array) => void): Promise<number> {
  const proc = Bun.spawn([tools.ffmpeg, "-v", "error", "-nostdin", ...args, "-f", "rawvideo", "-"], { stdout: "pipe", stderr: "pipe" });
  const frame = new Uint8Array(frameBytes);
  let filled = 0;
  let count = 0;
  const reader = proc.stdout.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    let at = 0;
    while (at < chunk.length) {
      const take = Math.min(frameBytes - filled, chunk.length - at);
      frame.set(chunk.subarray(at, at + take), filled);
      filled += take;
      at += take;
      if (filled === frameBytes) {
        onFrame(frame);
        filled = 0;
        count++;
      }
    }
  }
  const status = await proc.exited;
  if (status !== 0) throw new Error(`ffmpeg exited ${status}: ${(await new Response(proc.stderr).text()).trim()}`);
  return count;
}

/** One frame at `t` seconds, scaled and converted by `filter`, as raw bytes. */
export function grab(tools: Tools, path: string, t: number, filter: string): Uint8Array {
  const out = Bun.spawnSync([tools.ffmpeg, "-v", "error", "-nostdin", "-ss", t.toFixed(2), "-i", path, "-frames:v", "1", "-vf", filter, "-f", "rawvideo", "-"]);
  return new Uint8Array(out.stdout);
}
