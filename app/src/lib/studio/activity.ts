import { parseToolMeta, type HarnessItem } from "@/lib/harness";
import { shellCommands } from "@/lib/harness/oculusCli";
import type { RenderPreset } from "./render";

/** One `oculus studio …` call in a thread's tool rows. */
export interface StudioAction {
  /** The row it came from. */
  itemId: number;
  /** `render`, `narrate`, `frame`, `lint`, `new`, … */
  action: string;
  /** The video's slug: the last part of the folder (or slug) it was given. */
  slug: string | null;
  /** For a render: which preset it writes. */
  preset: RenderPreset;
  /** Undefined while the call runs. */
  ok?: boolean;
  output?: string;
}

const SHELLS = new Set(["sh", "zsh", "bash"]);
/** Studio flags that take a value, so the word after one is not the folder. */
const VALUED = new Set(["--preset", "-o", "--out", "--threads", "--scene", "--t", "--at", "--scale", "--theme", "--subject", "--title", "--voice", "--server", "--model"]);

const WINDOWS_SHELLS = new Set(["powershell", "pwsh", "cmd"]);
const WINDOWS_LINE = /^\s*(?:\S*[\\/])?(?:powershell|pwsh|cmd)(?:\.exe)?\s/i;

/** A Codex call wraps its command in `zsh -lc '…'`, or on Windows in
 *  `powershell -Command '…'`: unwrap it to the inner line. */
function commands(line: string, depth = 0): string[][] {
  if (depth > 3) return [];
  // In PowerShell and cmd a backslash is a path separator, never an escape.
  const text = WINDOWS_LINE.test(line) ? line.replace(/\\/g, "/") : line;
  return shellCommands(text).flatMap((words) => {
    const exe = (words[0]?.split("/").pop() ?? "").toLowerCase().replace(/\.exe$/, "");
    if (SHELLS.has(exe) && (words[1] === "-lc" || words[1] === "-c")) return commands(words[2] ?? "", depth + 1);
    if (WINDOWS_SHELLS.has(exe)) {
      const at = words.findIndex((w, i) => i > 0 && ["-command", "-c", "/c"].includes(w.toLowerCase()));
      // `& 'C:/…/oculus.exe' studio …` is PowerShell's call operator.
      const inner = at > 0 ? words.slice(at + 1).join(" ").replace(/\\/g, "/").replace(/^\s*&\s+/, "") : "";
      return inner ? commands(inner, depth + 1) : [];
    }
    return [words];
  });
}

/** The command a shell-shaped tool ran, in any provider's spelling. */
function commandLine(item: HarnessItem): string {
  const input = parseToolMeta(item).input as Record<string, unknown> | undefined;
  for (const v of [input?.command, input?.CommandLine, input?.Command, item.content]) {
    if (typeof v === "string" && v) return v;
    if (Array.isArray(v) && v.every((w) => typeof w === "string")) {
      return SHELLS.has((v[0] as string).split("/").pop() ?? "") && v.length === 3 ? (v[2] as string) : v.join(" ");
    }
  }
  return "";
}

function positional(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("-")) return a;
    if (VALUED.has(a)) i++;
  }
  return null;
}

function presetOf(args: string[]): RenderPreset {
  const at = args.indexOf("--preset");
  const named = at >= 0 ? args[at + 1] : args.find((a) => a.startsWith("--preset="))?.slice(9);
  if (args.includes("--final") || named === "final") return "final";
  return named === "small" ? "small" : "draft";
}

/** The `oculus studio` call a tool row made, or null. A line with several
 *  takes its first. */
export function studioAction(item: HarnessItem): StudioAction | null {
  if (item.kind !== "tool") return null;
  const meta = parseToolMeta(item);
  if (meta.kind !== "bash" && meta.kind !== "oculus_cli") return null;
  for (const words of commands(commandLine(item))) {
    let at = 0;
    while (at < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[at]) || ["time", "env", "command"].includes(words[at]))) at++;
    if (!/^oculus(?:\.exe)?$/i.test(words[at]?.split(/[/\\]/).pop() ?? "")) continue;
    at++;
    while (words[at] === "--json" || words[at] === "--no-color") at++;
    if (words[at] !== "studio" || !words[at + 1]) continue;
    const args = words.slice(at + 2);
    const dir = positional(args);
    return {
      itemId: item.id,
      action: words[at + 1],
      slug: dir ? (dir.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? null) : null,
      preset: presetOf(args),
      ok: meta.ok ?? undefined,
      output: meta.output ?? undefined,
    };
  }
  return null;
}

/** The thread's latest Studio call on `slug` other than `new`, and whether
 *  it is the call running now: the thread's last tool row, unfinished. */
export function lastStudioAction(
  items: readonly HarnessItem[],
  slug: string,
  running: boolean,
): { action: StudioAction; live: boolean } | null {
  let lastTool: HarnessItem | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== "tool") continue;
    lastTool ??= item;
    const action = studioAction(item);
    if (!action || action.action === "new" || (action.slug != null && action.slug !== slug)) continue;
    return { action, live: running && action.ok == null && item === lastTool };
  }
  return null;
}

/** The calls that make one of the video's steps. A failed check (`lint`,
 *  `frame`, …) is the agent finding something to fix, not the video failing. */
const MAKERS = new Set(["render", "narrate"]);

/** The thread's latest render or narration of `slug` that failed and was
 *  not tried again with success since; each step (narrate, draft, final)
 *  is judged by its own latest attempt. */
export function failedStep(items: readonly HarnessItem[], slug: string): StudioAction | null {
  const judged = new Set<string>();
  for (let i = items.length - 1; i >= 0; i--) {
    const action = studioAction(items[i]);
    if (!action || !MAKERS.has(action.action) || action.ok == null) continue;
    if (action.slug != null && action.slug !== slug) continue;
    const step = action.action === "render" ? `render:${action.preset}` : action.action;
    if (judged.has(step)) continue;
    judged.add(step);
    if (action.ok === false) return action;
  }
  return null;
}

/** Whether the thread's latest run has touched the video: a Studio call on
 *  it, or any tool row naming its folder (a write to its script, the
 *  folder `oculus studio new` printed). */
export function touchesVideo(items: readonly HarnessItem[], slug: string): boolean {
  const run = items[items.length - 1]?.run_id;
  if (run == null) return false;
  // A slug is `[a-z0-9-]+`, so it needs no escaping; `vv` is not `v`.
  const folder = new RegExp(`/videos/${slug}(?![a-z0-9-])`);
  for (let i = items.length - 1; i >= 0 && items[i].run_id === run; i--) {
    const item = items[i];
    if (item.kind !== "tool") continue;
    if (studioAction(item)?.slug === slug) return true;
    if (folder.test(item.meta ?? "") || folder.test(item.content ?? "")) return true;
  }
  return false;
}
