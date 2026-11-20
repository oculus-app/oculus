// Token use of Codex rollouts (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`,
// zstd-compressed once a thread is archived). A subagent is its own rollout
// whose session_meta names the parent thread.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { codexSessions } from "../paths";
import { studioCommands, type Counter } from "./common";

export function readRollout(path: string): string {
  const bytes = readFileSync(path);
  return (path.endsWith(".zst") ? zstdDecompressSync(bytes) : bytes).toString("utf8");
}

export type CodexScan = {
  id: string | null;
  parent: string | null;
  agent: string;
  cwd: string | null;
  model: string | null;
  effort: string | null;
  start: string | null;
  end: string | null;
  /** Model calls: token_count events carrying a running total. */
  calls: number;
  input: number;
  cached: number;
  output: number;
  /** The primary rate-limit window's used % at the first and last report, and its length. */
  window: { from: number | null; to: number | null; minutes: number | null };
  images: number;
  commands: Counter;
};

export function scanCodex(text: string): CodexScan {
  const s: CodexScan = {
    id: null, parent: null, agent: "root", cwd: null, model: null, effort: null, start: null, end: null,
    calls: 0, input: 0, cached: 0, output: 0, window: { from: null, to: null, minutes: null }, images: 0, commands: {},
  };
  let meta = false;
  for (const line of text.split("\n")) {
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const p = o.payload ?? {};
    if (o.timestamp) {
      s.start ??= o.timestamp;
      s.end = o.timestamp;
    }
    if (o.type === "session_meta" && !meta) {
      meta = true;
      s.id = p.id ?? null;
      s.parent = p.parent_thread_id ?? null;
      s.agent = p.agent_path ?? "root";
      s.cwd = p.cwd ?? null;
    }
    if (o.type === "turn_context") {
      s.model = p.model ?? s.model;
      s.effort = p.effort ?? s.effort;
    }
    if (p.type === "token_count") {
      const total = p.info?.total_token_usage;
      if (total) {
        s.calls++;
        s.input = total.input_tokens ?? 0;
        s.cached = total.cached_input_tokens ?? 0;
        s.output = total.output_tokens ?? 0;
      }
      const rl = p.rate_limits?.primary;
      if (rl?.used_percent != null) {
        s.window.from ??= rl.used_percent;
        s.window.to = rl.used_percent;
        s.window.minutes = rl.window_minutes ?? s.window.minutes;
      }
    }
    if (p.type === "function_call" || p.type === "local_shell_call" || p.type === "custom_tool_call") {
      const raw = JSON.stringify(p);
      for (const text of callStrings(p)) studioCommands(text, s.commands);
      if (raw.includes("view_image")) s.images++;
    }
  }
  return s;
}

/** The strings a tool call carries, unescaped: its arguments (JSON, parsed
 *  when it is), its free-form input and its shell action. */
function callStrings(p: any): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const v of [p.arguments, p.input]) {
    if (typeof v !== "string") {
      walk(v);
      continue;
    }
    try {
      walk(JSON.parse(v));
    } catch {
      out.push(v);
    }
  }
  walk(p.action);
  return out;
}

/** Day folders from the day before `since` (folders are local dates, times UTC) on. */
function rolloutFiles(since: string): string[] {
  const root = codexSessions();
  if (!existsSync(root)) throw new Error(`no Codex sessions folder at ${root}`);
  const from = new Date(Date.parse(since) - 86_400_000);
  const floor = `${from.getFullYear()}/${String(from.getMonth() + 1).padStart(2, "0")}/${String(from.getDate()).padStart(2, "0")}`;
  const out: string[] = [];
  const dirs = (d: string) => (existsSync(d) ? readdirSync(d).filter((n) => /^\d+$/.test(n)).sort() : []);
  for (const y of dirs(root))
    for (const m of dirs(join(root, y)))
      for (const d of dirs(join(root, y, m))) {
        if (`${y}/${m}/${d}` < floor) continue;
        const day = join(root, y, m, d);
        for (const f of readdirSync(day)) if (/\.jsonl(\.zst)?$/.test(f)) out.push(join(day, f));
      }
  return out;
}

export type CodexThread = { root: CodexScan; subagents: CodexScan[] };

/** Threads started from `cwd` at or after `since` (and before `until`), each
 *  with its subagents. Unless `all`, only threads that ran `oculus studio`. */
export function findCodexThreads(cwd: string, since: string, until?: string, all = false): CodexThread[] {
  const from = Date.parse(since);
  const to = until ? Date.parse(until) : Infinity;
  const scans = rolloutFiles(since).map((f) => scanCodex(readRollout(f)));
  const roots = scans.filter((s) => !s.parent && s.cwd === cwd && Date.parse(s.start ?? "") >= from && Date.parse(s.start ?? "") < to);
  return roots
    .map((root) => ({ root, subagents: scans.filter((s) => s.parent && s.parent === root.id) }))
    .filter((t) => all || [t.root, ...t.subagents].some((s) => Object.keys(s.commands).length))
    .sort((a, b) => (a.root.start ?? "").localeCompare(b.root.start ?? ""));
}

const READS = /(reference\.md|build\.md|studio\.d\.ts|SKILL\.md|\.tsx|notes\/|storyboard|script\.md)/;

/** What fills a rollout's context: the input size of each model call, and the
 *  bytes of tool calls and their output by kind of command. */
export function codexContext(text: string) {
  const kinds = new Map<string, string>();
  const bytes: Counter = {};
  const counts: Counter = {};
  const context: number[] = [];
  let images = 0;
  const add = (key: string, n: number) => {
    bytes[key] = (bytes[key] ?? 0) + n;
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const line of text.split("\n")) {
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const p = o.payload ?? {};
    if (p.type === "token_count" && p.info?.last_token_usage) context.push(p.info.last_token_usage.input_tokens);
    if (p.type === "function_call" || p.type === "custom_tool_call" || p.type === "local_shell_call") {
      const v = p.arguments ?? p.input ?? JSON.stringify(p.action ?? "");
      const s = typeof v === "string" ? v : JSON.stringify(v);
      const studio = /oculus studio (\w+)/.exec(s);
      const read = READS.exec(s);
      const kind = studio
        ? `studio ${studio[1]}`
        : s.includes("Begin Patch") || p.name === "apply_patch"
          ? "apply_patch"
          : p.name === "view_image"
            ? "view_image"
            : read
              ? `read ${read[1]}`
              : "other shell";
      kinds.set(p.call_id, kind);
      add(`IN ${kind}`, s.length);
    }
    if (p.type === "function_call_output" || p.type === "custom_tool_call_output") {
      const kind = kinds.get(p.call_id) ?? "?";
      let s = typeof p.output === "string" ? p.output : JSON.stringify(p.output);
      if (s.includes("image_url") || s.includes("input_image")) {
        images++;
        s = s.replace(/data:image[^"]{100,}/g, "IMG");
      }
      add(`OUT ${kind}`, s.length);
    }
  }
  return { context, images, bytes, counts };
}
