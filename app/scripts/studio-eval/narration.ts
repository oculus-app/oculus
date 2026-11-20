// Narration numbers: when each word is said (from YouTube json3 captions or a
// Studio video's narration manifest), the pace that gives, and how the script
// talks: pointing words and the persons it speaks in.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Seg = { utf8?: string; tOffsetMs?: number };
type Json3 = { events?: { tStartMs?: number; dDurationMs?: number; segs?: Seg[] }[] };

/** Start time of every word, seconds. Auto captions time each segment; an
 *  uploaded track times only the cue, so its words are spread evenly over it. */
export function captionWords(json: Json3): number[] {
  const out: number[] = [];
  for (const e of json.events ?? []) {
    const t0 = e.tStartMs ?? 0;
    const segs = (e.segs ?? []).filter((s) => (s.utf8 ?? "").trim());
    const d = e.dDurationMs ?? 0;
    if (segs.length && !segs.some((s) => "tOffsetMs" in s)) {
      const words = segs.map((s) => s.utf8).join(" ").split(/\s+/).filter(Boolean);
      words.forEach((_, i) => out.push((t0 + (d * i) / Math.max(1, words.length)) / 1000));
    } else {
      for (const s of segs) {
        (s.utf8 ?? "").split(/\s+/).filter(Boolean).forEach((_, i) => out.push((t0 + (s.tOffsetMs ?? 0)) / 1000 + i * 0.01));
      }
    }
  }
  return out.sort((a, b) => a - b);
}

/** What the captions say, with `[Music]`-style annotations removed. */
export function captionText(json: Json3): string {
  return (json.events ?? [])
    .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
    .join(" ")
    .replace(/\[[^\]]*\]/g, " ");
}

type VideoJson = { scenes: { id: string; hold?: number }[] };
type Manifest = { scenes: Record<string, { duration: number; words: { start: number }[] }> };

/** Start time of every narrated word in the video, seconds. Scenes are laid
 *  end to end: a narrated one lasts its clip plus 1 s, a silent one its `hold`
 *  (3 s if it has none). This ignores the theme's lead and transitions, so it
 *  places words to within about a second; the counts and gaps inside a scene,
 *  which the rates come from, are exact. */
export function studioWords(video: VideoJson, manifest: Manifest): number[] {
  const out: number[] = [];
  let off = 0;
  for (const s of video.scenes) {
    const m = manifest.scenes[s.id];
    if (!m) {
      off += s.hold ?? 3;
      continue;
    }
    for (const w of m.words) out.push(off + w.start);
    off += m.duration + 1.0;
  }
  return out;
}

/** A Studio video folder's word times and spoken script, or null if it has
 *  not been narrated. */
export function readStudio(dir: string): { words: number[]; text: string } | null {
  const manifestPath = join(dir, "narration", "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const video = JSON.parse(readFileSync(join(dir, "video.json"), "utf8")) as VideoJson;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const script = existsSync(join(dir, "script.md")) ? readFileSync(join(dir, "script.md"), "utf8") : "";
  return { words: studioWords(video, manifest), text: spokenScript(script) };
}

/** script.md as said: `## <id>` headings, pause markers and `*`, `_`, backticks
 *  dropped, as `ScriptSection` reads it (docs/studio.md, "Narration sets a
 *  scene's length"). */
export function spokenScript(md: string): string {
  return md
    .split("\n")
    .filter((line) => !/^## /.test(line))
    .join("\n")
    .replace(/\[pause[^\]]*\]?/gi, " ")
    .replace(/[*_`]/g, "");
}

/** A long silence between words, seconds. */
export const PAUSE = 1.5;

export type PaceStats = {
  words: number;
  /** Words a minute over the whole running time. */
  wpm: number;
  /** Gaps of PAUSE seconds or more between words, per minute. */
  pauses: number;
  /** % of the running time inside those gaps. */
  pause_share: number;
};

export function paceStats(words: number[], duration: number): PaceStats {
  if (!words.length) return { words: 0, wpm: 0, pauses: 0, pause_share: 0 };
  const gaps: number[] = [];
  for (let i = 1; i < words.length; i++) gaps.push(words[i] - words[i - 1]);
  const pauses = gaps.filter((g) => g >= PAUSE);
  return {
    words: words.length,
    wpm: (words.length / duration) * 60,
    pauses: (pauses.length / duration) * 60,
    pause_share: (100 * pauses.reduce((a, b) => a + b, 0)) / duration,
  };
}

/** Words that point the viewer at the picture. */
export const POINTING = ["this", "here", "look", "watch", "see"] as const;

export type VoiceStats = {
  /** Words in the text the counts are over. */
  spoken: number;
  /** POINTING words per 100 words, and each one's count. */
  pointing: number;
  pointingBy: Record<(typeof POINTING)[number], number>;
  /** "you", "we" and "I" per 100 words; a contraction (you're, we'll, I'm)
   *  counts as its pronoun. */
  you: number;
  we: number;
  i: number;
};

export function voiceStats(text: string): VoiceStats {
  const tokens = text.toLowerCase().replace(/’/g, "'").match(/[a-z0-9]+(?:'[a-z]+)*/g) ?? [];
  const pointingBy = Object.fromEntries(POINTING.map((w) => [w, 0])) as VoiceStats["pointingBy"];
  const persons = { you: 0, we: 0, i: 0 };
  for (const t of tokens) {
    if (t in pointingBy) pointingBy[t as keyof typeof pointingBy]++;
    const base = t.split("'")[0];
    if (base in persons) persons[base as keyof typeof persons]++;
  }
  const per100 = (n: number) => (tokens.length ? (100 * n) / tokens.length : 0);
  return {
    spoken: tokens.length,
    pointing: per100(Object.values(pointingBy).reduce((a, b) => a + b, 0)),
    pointingBy,
    you: per100(persons.you),
    we: per100(persons.we),
    i: per100(persons.i),
  };
}
