// Measures a Studio video against reference videos, and what making it cost.
// `bun scripts/studio-eval help` lists the commands; docs/studio-eval.md says
// what each number means.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { findTools, probe } from "./ffmpeg";
import { captionText, captionWords, paceStats, readStudio, voiceStats } from "./narration";
import { dataDir, videoDir } from "./paths";
import { fill, motion, pictureStats } from "./picture";
import { sheet } from "./sheet";
import { findClaudeSessions, readClaudeSession, sessionUsage, type ClaudeSession } from "./tokens/claude";
import { codexContext, findCodexThreads, readRollout, scanCodex, type CodexScan } from "./tokens/codex";
import { fmtCounter, k, M, merge, type Counter } from "./tokens/common";

const HELP = `bun scripts/studio-eval <command>

  video <mp4> [--slug <studio slug> | --captions <file.json3>] [--name <label>]
        [--motion <txt>] [--save-motion <txt>] [--samples 40] [--json]
      Picture and narration numbers for one video. Captions default to the
      .en.json3 beside the mp4; --slug reads that Studio video's folder.
  motion <mp4> [out.txt]
      The 5 fps luma-change series, one value a line.
  sheet <mp4> <out.jpg> [--start 0] [--step 10] [--cols 4] [--rows 4]
      A contact sheet: one frame every --step seconds from --start.
  tokens claude [<session.jsonl> ...] [--since <iso> [--until <iso>] [--cwd <dir>] [--all]] [--json]
  tokens codex  [<rollout.jsonl[.zst]> ...] [--since <iso> [--until <iso>] [--cwd <dir>] [--all]] [--context] [--json]
      Token use of agent sessions. --cwd defaults to the app's agents folder,
      where chat threads run; without --all only sessions that ran
      \`oculus studio\` are listed.

  Everywhere: --data <dir> (the app's data folder), --ffmpeg <path>.`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    slug: { type: "string" },
    captions: { type: "string" },
    name: { type: "string" },
    motion: { type: "string" },
    "save-motion": { type: "string" },
    samples: { type: "string", default: "40" },
    start: { type: "string", default: "0" },
    step: { type: "string", default: "10" },
    cols: { type: "string", default: "4" },
    rows: { type: "string", default: "4" },
    since: { type: "string" },
    until: { type: "string" },
    cwd: { type: "string" },
    all: { type: "boolean", default: false },
    context: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    data: { type: "string" },
    ffmpeg: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, ...args] = positionals;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function video(path: string) {
  if (!existsSync(path)) fail(`no such video: ${path}`);
  if (flags.slug && flags.captions) fail("--slug and --captions both give the words; pass one");
  const tools = findTools(flags.ffmpeg);
  const { duration } = probe(tools, path);
  const series = flags.motion ? readSeries(flags.motion) : await motion(tools, path);
  if (flags["save-motion"]) writeFileSync(flags["save-motion"], series.join("\n") + "\n");

  let words: number[] = [];
  let text = "";
  let source = "none";
  if (flags.slug) {
    const dir = videoDir(dataDir(flags.data), flags.slug);
    const studio = existsSync(dir) ? readStudio(dir) : null;
    if (!studio) fail(`${dir} is not a narrated Studio video`);
    ({ words, text } = studio);
    source = dir;
  } else {
    const captions = flags.captions ?? path.replace(/\.mp4$/i, ".en.json3");
    if (existsSync(captions)) {
      const json = JSON.parse(readFileSync(captions, "utf8"));
      words = captionWords(json);
      text = captionText(json);
      source = captions;
    } else if (flags.captions) fail(`no such captions file: ${captions}`);
  }

  const row = {
    id: basename(path).replace(/\.mp4$/i, ""),
    name: flags.name ?? basename(path),
    dur: duration,
    ...pictureStats(series, duration),
    ...paceStats(words, duration),
    ...fill(tools, path, duration, Number(flags.samples)),
    ...(text ? voiceStats(text) : {}),
    words_from: source,
  };
  if (flags.json) return console.log(JSON.stringify(row, null, 1));
  const r = row as typeof row & Partial<ReturnType<typeof voiceStats>>;
  const n = (x: number, d = 1) => x.toFixed(d);
  console.log(`${r.name}  (${n(r.dur / 60)} min; words from ${source})
  picture   still ${n(r.still, 0)}%  holds>=3s ${n(r.hold3, 0)}%  longest hold ${n(r.longest)} s  motion events ${n(r.events)}/min  big changes ${n(r.big)}/min  median change ${n(r.mag, 2)}
  fill      ink ${n(r.fill)}%  bounding box ${n(r.box, 0)}%
  pace      ${r.words} words  ${n(r.wpm, 0)} wpm  pauses>=1.5s ${n(r.pauses)}/min (${n(r.pause_share, 0)}% of the time)`);
  if (r.spoken != null) {
    const by = Object.entries(r.pointingBy!).map(([w, c]) => `${w} ${c}`).join(", ");
    console.log(`  voice     pointing ${n(r.pointing!)}/100 words (${by})  you ${n(r.you!)}  we ${n(r.we!)}  I ${n(r.i!)} per 100 (${r.spoken} words)`);
  }
}

function readSeries(path: string): number[] {
  return readFileSync(path, "utf8").split("\n").filter((l) => l.trim()).map(Number);
}

async function motionCommand(path: string, out?: string) {
  const series = await motion(findTools(flags.ffmpeg), path);
  const text = series.join("\n") + "\n";
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
}

function defaultCwd() {
  return flags.cwd ?? join(dataDir(flags.data), "agents");
}

function claude(files: string[]) {
  const sessions: ClaudeSession[] = files.length
    ? files.map(readClaudeSession)
    : flags.since
      ? findClaudeSessions(defaultCwd(), flags.since, flags.until, flags.all)
      : fail("tokens claude: pass session files or --since <iso time>");
  const rows = sessions.map((s) => {
    const usage = sessionUsage(s);
    const subCommands: Counter = {};
    const agents: Counter = {};
    for (const sub of s.subagents) merge(subCommands, sub.commands);
    merge(agents, s.main.agents);
    return { id: s.id, path: s.path, start: s.main.first, end: s.main.last, usage, commands: s.main.commands, subagentCommands: subCommands, agentStarts: agents, subagentFiles: s.subagents.length };
  });
  if (flags.json) return console.log(JSON.stringify(rows, null, 1));
  for (const r of rows) {
    console.log(`\n${r.start} -> ${r.end}  ${r.id}`);
    console.log(`  main commands: ${fmtCounter(r.commands)}`);
    console.log(`  agent starts: ${fmtCounter(r.agentStarts)}; subagent transcripts ${r.subagentFiles}; their commands: ${fmtCounter(r.subagentCommands)}`);
    const total = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    for (const [key, u] of Object.entries(r.usage).sort()) {
      console.log(`  ${key.padEnd(34)} calls ${String(u.calls).padStart(4)}  in ${k(u.input).padStart(6)}  out ${k(u.output).padStart(6)}  cache write ${M(u.cacheWrite).padStart(6)}  cache read ${M(u.cacheRead).padStart(7)}`);
      for (const f of Object.keys(total) as (keyof typeof total)[]) total[f] += u[f];
    }
    console.log(`  ${"TOTAL".padEnd(34)} calls ${String(total.calls).padStart(4)}  in ${k(total.input).padStart(6)}  out ${k(total.output).padStart(6)}  cache write ${M(total.cacheWrite).padStart(6)}  cache read ${M(total.cacheRead).padStart(7)}`);
  }
  if (!rows.length) console.log("no sessions");
}

function codexLine(s: CodexScan) {
  const span = `${(s.start ?? "").slice(11, 16)}-${(s.end ?? "").slice(11, 16)}`;
  const win = s.window.from == null ? "" : `  ${s.window.minutes ? `${s.window.minutes / 60}h` : "window"} ${s.window.from}% -> ${s.window.to}%`;
  return `${span} ${s.agent.slice(0, 34).padEnd(34)} ${String(s.model).slice(0, 16)}/${String(s.effort).slice(0, 6)}  calls ${String(s.calls).padStart(4)}  in ${M(s.input)} (cached ${M(s.cached)})  out ${k(s.output)}  images ${s.images}${win}  ${fmtCounter(s.commands)}`;
}

function codex(files: string[]) {
  if (flags.context) {
    if (!files.length) fail("tokens codex --context: pass rollout files");
    for (const f of files) {
      const c = codexContext(readRollout(f));
      const ctx = c.context;
      const upper = [...ctx].sort((a, b) => a - b)[ctx.length >> 1] ?? 0;
      if (flags.json) {
        console.log(JSON.stringify({ file: f, ...c }, null, 1));
        continue;
      }
      console.log(`\n${f}\ncalls ${ctx.length}; context first ${k(ctx[0] ?? 0)}, median ${k(upper)}, last ${k(ctx.at(-1) ?? 0)}, peak ${k(Math.max(0, ...ctx))}; images in outputs ${c.images}`);
      const total = Object.values(c.bytes).reduce((a, b) => a + b, 0);
      for (const [key, v] of Object.entries(c.bytes).sort((a, b) => b[1] - a[1]).slice(0, 22)) {
        console.log(`  ${key.padEnd(28)} x${String(c.counts[key]).padStart(3)}  ${(v / 1e3).toFixed(1).padStart(7)} KB  (~${(v / 4 / 1e3).toFixed(1).padStart(5)}k tok)  ${((100 * v) / total).toFixed(1).padStart(4)}%`);
      }
    }
    return;
  }
  const threads = files.length
    ? [{ root: null, subagents: files.map((f) => scanCodex(readRollout(f))) }]
    : flags.since
      ? findCodexThreads(defaultCwd(), flags.since, flags.until, flags.all)
      : fail("tokens codex: pass rollout files or --since <iso time>");
  if (flags.json) return console.log(JSON.stringify(threads, null, 1));
  for (const t of threads) {
    const all = [...(t.root ? [t.root] : []), ...t.subagents];
    console.log(t.root ? `\nthread ${t.root.id}` : "\nrollouts");
    for (const s of all) console.log(codexLine(s));
    const sum = (f: (s: CodexScan) => number) => all.reduce((a, s) => a + f(s), 0);
    const input = sum((s) => s.input);
    const cached = sum((s) => s.cached);
    console.log(`TOTAL ${all.length} sessions: calls ${sum((s) => s.calls)}, input ${M(input)} (cached ${M(cached)}, fresh ${M(input - cached)}), output ${k(sum((s) => s.output))}, images viewed ${sum((s) => s.images)}`);
  }
  if (!threads.length) console.log("no threads");
}

async function main() {
  if (flags.help || !command || command === "help") return console.log(HELP);
  if (command === "video") return args[0] ? video(args[0]) : fail(HELP);
  if (command === "motion") return args[0] ? motionCommand(args[0], args[1]) : fail(HELP);
  if (command === "sheet") {
    if (args.length < 2) fail(HELP);
    const placed = await sheet(findTools(flags.ffmpeg), args[0], args[1], {
      start: Number(flags.start), step: Number(flags.step), cols: Number(flags.cols), rows: Number(flags.rows),
    });
    return console.log(`${args[1]}: ${placed} frames`);
  }
  if (command === "tokens" && args[0] === "claude") return claude(args.slice(1));
  if (command === "tokens" && args[0] === "codex") return codex(args.slice(1));
  fail(HELP);
}

await main();
