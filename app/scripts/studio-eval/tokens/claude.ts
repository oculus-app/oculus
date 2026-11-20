// Token use of Claude Code sessions: a main session's jsonl plus the subagent
// transcripts beside it (`<session>/subagents/*.jsonl`), by model.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { claudeProjectFolder, claudeProjects } from "../paths";
import { studioCommands, type Counter } from "./common";

export type Usage = { calls: number; input: number; output: number; cacheWrite: number; cacheRead: number };
export type ClaudeScan = {
  usage: Record<string, Usage>;
  commands: Counter;
  agents: Counter;
  first: string | null;
  last: string | null;
};

const empty = (): Usage => ({ calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });

/** One transcript. Claude Code writes a line per content block, each carrying
 *  the whole message's usage, so a message id is counted once. */
export function scanClaude(text: string): ClaudeScan {
  const usage: Record<string, Usage> = {};
  const commands: Counter = {};
  const agents: Counter = {};
  const seen = new Set<string>();
  let first: string | null = null;
  let last: string | null = null;
  for (const line of text.split("\n")) {
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.timestamp) {
      first ??= o.timestamp;
      last = o.timestamp;
    }
    if (o.type !== "assistant") continue;
    const m = o.message ?? {};
    const u = m.usage ?? {};
    if (m.id && !seen.has(m.id)) {
      seen.add(m.id);
      const r = (usage[m.model ?? "?"] ??= empty());
      r.calls++;
      r.input += u.input_tokens ?? 0;
      r.output += u.output_tokens ?? 0;
      r.cacheWrite += u.cache_creation_input_tokens ?? 0;
      r.cacheRead += u.cache_read_input_tokens ?? 0;
    }
    for (const c of m.content ?? []) {
      if (c?.type !== "tool_use") continue;
      const i = c.input ?? {};
      if (c.name === "Bash") studioCommands(String(i.command ?? ""), commands);
      if (c.name === "Agent" || c.name === "Task") bump(agents, i.subagent_type ?? "?");
      if (c.name === "Read" && String(i.file_path ?? "").endsWith(".png")) bump(commands, "READ_PNG");
    }
  }
  return { usage, commands, agents, first, last };
}

export type ClaudeSession = {
  id: string;
  path: string;
  main: ClaudeScan;
  subagents: ClaudeScan[];
};

export function readClaudeSession(path: string): ClaudeSession {
  const id = basename(path, ".jsonl");
  const subDir = join(dirname(path), id, "subagents");
  const subs = existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")).map((f) => join(subDir, f)) : [];
  return {
    id,
    path,
    main: scanClaude(readFileSync(path, "utf8")),
    subagents: subs.map((f) => scanClaude(readFileSync(f, "utf8"))),
  };
}

/** Sessions run from `cwd` that started at or after `since` (and before
 *  `until`). Unless `all`, only those that ran an `oculus studio` command. */
export function findClaudeSessions(cwd: string, since: string, until?: string, all = false): ClaudeSession[] {
  const dir = join(claudeProjects(), claudeProjectFolder(cwd));
  if (!existsSync(dir)) throw new Error(`no Claude Code sessions for ${cwd} (looked in ${dir})`);
  const from = Date.parse(since);
  const to = until ? Date.parse(until) : Infinity;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).mtimeMs >= from)
    .map(readClaudeSession)
    .filter((s) => {
      const t = Date.parse(s.main.first ?? "");
      if (!(t >= from && t < to)) return false;
      return all || [s.main, ...s.subagents].some((x) => Object.keys(x.commands).some((k) => k !== "READ_PNG"));
    })
    .sort((a, b) => (a.main.first ?? "").localeCompare(b.main.first ?? ""));
}

function bump(c: Counter, k: string) {
  c[k] = (c[k] ?? 0) + 1;
}

/** Usage by `main:<model>` and `sub:<model>`. */
export function sessionUsage(s: ClaudeSession): Record<string, Usage> {
  const out: Record<string, Usage> = {};
  const add = (prefix: string, scan: ClaudeScan) => {
    for (const [model, u] of Object.entries(scan.usage)) {
      const r = (out[`${prefix}:${model}`] ??= empty());
      r.calls += u.calls;
      r.input += u.input;
      r.output += u.output;
      r.cacheWrite += u.cacheWrite;
      r.cacheRead += u.cacheRead;
    }
  };
  add("main", s.main);
  for (const sub of s.subagents) add("sub", sub);
  return out;
}
