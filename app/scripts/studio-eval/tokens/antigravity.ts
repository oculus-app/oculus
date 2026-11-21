// Token use of Antigravity sessions, from either:
//   - native transcripts (`~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`,
//     or `$ANTIGRAVITY_APP_DATA_DIR/brain/...`), which carry per-call `model`,
//     `input_tokens` (fresh), `cache_read_tokens`, `output_tokens` and `tool_calls`;
//   - Oculus's raw ACP thread logs (`<data>/agents/threads/<id>.ndjson`), which
//     carry per-turn `result.usage` (`inputTokens`, `cachedReadTokens`,
//     `cachedWriteTokens`, `outputTokens`, `thoughtTokens`), `usage_update`
//     context sizes and `tool_call` updates.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { antigravityBrain, oculusThreads } from "../paths";
import { studioCommands, type Counter } from "./common";

export type AntigravityUsage = {
  calls: number;
  /** Uncached (fresh) input tokens. */
  input: number;
  cachedRead: number;
  cachedWrite: number;
  output: number;
  thought: number;
};

export type AntigravityScan = {
  id: string;
  path: string;
  format: "transcript" | "acp";
  start: string | null;
  end: string | null;
  usage: Record<string, AntigravityUsage>;
  /** Total context tokens (fresh + cached) on each call or usage_update. */
  context: number[];
  contextWindow: number | null;
  images: number;
  commands: Counter;
  agents: Counter;
};

const empty = (): AntigravityUsage => ({
  calls: 0,
  input: 0,
  cachedRead: 0,
  cachedWrite: 0,
  output: 0,
  thought: 0,
});

function bump(c: Counter, k: string) {
  c[k] = (c[k] ?? 0) + 1;
}

/** `transcript.jsonl` stores tool argument values as JSON-encoded strings (`"\"/path\""`). */
function unwrapArg(v: unknown): string {
  if (typeof v !== "string") return "";
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      const parsed = JSON.parse(v);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Keep raw string when not valid JSON.
    }
  }
  return v;
}

/** A half-open time window in epoch ms; a transcript's steps outside it are skipped. */
export type Window = { from: number; to: number };
const ALWAYS: Window = { from: -Infinity, to: Infinity };

function scanTranscript(text: string, id: string, path: string, window: Window): AntigravityScan {
  const usage: Record<string, AntigravityUsage> = {};
  const commands: Counter = {};
  const agents: Counter = {};
  const context: number[] = [];
  let images = 0;
  let start: string | null = null;
  let end: string | null = null;

  for (const line of text.split("\n")) {
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof o.created_at === "string") {
      const at = Date.parse(o.created_at);
      if (at < window.from || at >= window.to) continue;
      start ??= o.created_at;
      end = o.created_at;
    }
    if (o.type !== "PLANNER_RESPONSE") continue;
    const model = typeof o.model === "string" && o.model ? o.model : "antigravity";
    const fresh = Number(o.input_tokens ?? 0);
    const cached = Number(o.cache_read_tokens ?? 0);
    const out = Number(o.output_tokens ?? 0);
    const r = (usage[model] ??= empty());
    r.calls++;
    r.input += fresh;
    r.cachedRead += cached;
    r.output += out;
    if (fresh + cached > 0) context.push(fresh + cached);

    for (const c of o.tool_calls ?? []) {
      const args = c?.args ?? c?.arguments ?? {};
      if (c?.name === "run_command") {
        studioCommands(unwrapArg(args.CommandLine ?? args.Command), commands);
      }
      if (c?.name === "read_file" || c?.name === "view_file") {
        const file = unwrapArg(args.Path ?? args.AbsolutePath ?? args.TargetFile);
        if (file.toLowerCase().endsWith(".png")) {
          images++;
          bump(commands, "READ_PNG");
        }
      }
      if (c?.name === "invoke_subagent") {
        bump(agents, unwrapArg(args.TypeName ?? args.Role) || "?");
      }
    }
  }

  return { id, path, format: "transcript", start, end, usage, context, contextWindow: null, images, commands, agents };
}

function scanAcp(text: string, id: string, path: string): AntigravityScan {
  const usage: Record<string, AntigravityUsage> = {};
  const commands: Counter = {};
  const agents: Counter = {};
  const context: number[] = [];
  const seenCalls = new Set<string>();
  let contextWindow: number | null = null;
  let images = 0;

  for (const line of text.split("\n")) {
    let o: any;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o.method === "session/update") {
      const u = o.params?.update;
      if (!u) continue;
      if (u.sessionUpdate === "usage_update") {
        if (typeof u.used === "number" && u.used > 0) context.push(u.used);
        if (typeof u.size === "number") contextWindow = u.size;
      }
      if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") {
        const callId = typeof u.toolCallId === "string" ? u.toolCallId : null;
        if (callId && seenCalls.has(callId)) continue;
        if (callId) seenCalls.add(callId);
        const input = u.rawInput ?? u.args ?? {};
        if (u.name === "run_command") {
          studioCommands(String(input.CommandLine ?? input.Command ?? ""), commands);
        }
        if (u.name === "read_file" || u.name === "view_file") {
          const file = String(input.Path ?? input.AbsolutePath ?? input.TargetFile ?? "");
          if (file.toLowerCase().endsWith(".png")) {
            images++;
            bump(commands, "READ_PNG");
          }
        }
        if (u.name === "invoke_subagent") {
          bump(agents, String(input.TypeName ?? input.Role ?? "?"));
        }
      }
    } else if (o.result?.usage && typeof o.result.usage === "object") {
      const u = o.result.usage;
      const r = (usage["acp"] ??= empty());
      r.calls++;
      r.input += Number(u.inputTokens ?? 0);
      r.cachedRead += Number(u.cachedReadTokens ?? 0);
      r.cachedWrite += Number(u.cachedWriteTokens ?? 0);
      r.output += Number(u.outputTokens ?? 0);
      r.thought += Number(u.thoughtTokens ?? 0);
    }
  }

  return { id, path, format: "acp", start: null, end: null, usage, context, contextWindow, images, commands, agents };
}

/** Detect native `transcript.jsonl` vs Oculus's raw ACP `.ndjson` from content.
 *  Only a transcript's steps are timed, so `window` cuts nothing from an ACP log. */
export function scanAntigravity(text: string, id = "session", path = "", window: Window = ALWAYS): AntigravityScan {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const o = JSON.parse(trimmed);
      if (o.jsonrpc === "2.0") return scanAcp(text, id, path);
      if (o.step_index != null || o.type === "USER_INPUT" || o.type === "PLANNER_RESPONSE") {
        return scanTranscript(text, id, path, window);
      }
    } catch {
      continue;
    }
  }
  return scanTranscript(text, id, path, window);
}

export function readAntigravitySession(path: string, window: Window = ALWAYS): AntigravityScan {
  const id = path.endsWith("transcript.jsonl")
    ? basename(dirname(dirname(dirname(path))))
    : basename(path).replace(/\.(jsonl|ndjson)$/, "");
  return scanAntigravity(readFileSync(path, "utf8"), id, path, window);
}

/** Antigravity transcripts with a model call inside the window, and Oculus ACP
 *  thread logs last written inside it. */
export function findAntigravitySessions(
  data: string,
  since: string,
  until?: string,
  all = false,
): AntigravityScan[] {
  const from = Date.parse(since);
  const to = until ? Date.parse(until) : Infinity;
  const files: string[] = [];

  const brain = antigravityBrain();
  if (existsSync(brain)) {
    for (const entry of readdirSync(brain)) {
      const transcript = join(brain, entry, ".system_generated", "logs", "transcript.jsonl");
      if (!existsSync(transcript)) continue;
      if (statSync(transcript).mtimeMs >= from) files.push(transcript);
    }
  }

  const threads = oculusThreads(data);
  if (existsSync(threads)) {
    for (const f of readdirSync(threads)) {
      if (!f.endsWith(".ndjson")) continue;
      const full = join(threads, f);
      const mtime = statSync(full).mtimeMs;
      if (mtime < from || mtime >= to) continue;
      // Only agy's ACP lines carry `sessionUpdate`; a log opens with the long
      // `initialize` reply, so the whole file is searched.
      if (readFileSync(full, "utf8").includes('"sessionUpdate"')) files.push(full);
    }
  }

  return files
    .map((f) => readAntigravitySession(f, { from, to }))
    .filter((s) => Object.keys(s.usage).length > 0)
    .filter((s) => all || Object.keys(s.commands).some((k) => k !== "READ_PNG"))
    .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
}
