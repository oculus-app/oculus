// Shared by the Claude and Codex readers.

export type Counter = Record<string, number>;

/** Where a command can start: a line's start, after a shell operator or an
 *  opening quote (a command string inside code), optionally behind a path. Prose
 *  in a heredoc, such as `oculus studio new` in backticks, is not a run. */
const STUDIO = /(?:^|[;&|("'])\s*(?:[^\s;&|("'`]*\/)?oculus\s+studio\s+(\w+)/gm;

/** Count each `oculus studio <command>` run in a command line. */
export function studioCommands(text: string, into: Counter): Counter {
  for (const m of text.matchAll(STUDIO)) into[m[1]] = (into[m[1]] ?? 0) + 1;
  return into;
}

export function merge(into: Counter, from: Counter): Counter {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  return into;
}

export const fmtCounter = (c: Counter) =>
  Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "none";

export const k = (n: number) => `${(n / 1e3).toFixed(0)}k`;
export const M = (n: number) => `${(n / 1e6).toFixed(2)}M`;
