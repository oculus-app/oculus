import { displayCode } from "@/lib/format/format";

export interface Args {
  pos: string[];
  flags: Map<string, string | true>;
}

/** Flags that take no value, so the word after them is positional. */
const BOOL_FLAGS = new Set([
  "--all", "--full", "--fixed", "--case-sensitive", "-l", "--files-with-matches",
  "--indexed", "--due", "--past", "--reparse", "--refresh", "--ed", "--no-parse",
  "--no-embed", "--videos", "--transcripts", "--force", "--stdout", "--global",
  "--keep", "--personal", "--archived", "--unfiled", "--frames", "--dry-run",
  "--portrait", "--exact", "--sheet", "--draft", "--final", "--motion-blur", "--reset", "-F",
  "--print-prompt", "--json", "--help", "-h", "-i", "--subjects", "--lectures",
]);

const SEPARATORS = ["&&", "||", ";", "\n"];

/** The commands of a shell line as words, quotes removed. A pipe or redirect
 *  ends what is kept of a command (`| head -30`, `2>&1`). */
export function parseShell(line: string) {
  let combinedStatus = false;
  const out: string[][] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  let quote: string | null = null;
  let dropping = false;
  let heredoc: { delimiter: string; tabs: boolean } | null = null;
  const endWord = () => {
    if (inWord && !dropping) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) out.push(words);
    words = [];
    dropping = false;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"' && /["\\$`\n]/.test(line[i + 1] ?? "")) word += line[++i];
      else word += c;
      continue;
    }
    const sep = SEPARATORS.find((s) => line.startsWith(s, i));
    if (sep === "\n" && heredoc) {
      // The heredoc's body is the command's stdin, not more commands.
      endCommand();
      const end = heredocEnd(line, i + 1, heredoc);
      if (line.slice(end).trim()) combinedStatus = true;
      heredoc = null;
      i = end - 1;
    } else if (sep) {
      if (sep !== "&&" && words.length + Number(inWord) > 0 && line.slice(i + sep.length).trim()) combinedStatus = true;
      endCommand();
      i += sep.length - 1;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === "\\" && i + 1 < line.length) {
      word += /^[A-Za-z]:/.test(word) && /[\w.]/.test(line[i + 1]) ? c : line[++i];
      inWord = true;
    } else if (c === "<" && line[i + 1] === "<" && HEREDOC.test(line.slice(i))) {
      const m = HEREDOC.exec(line.slice(i))!;
      heredoc = { delimiter: m[2] ?? m[3] ?? m[4], tabs: m[1] === "-" };
      endWord();
      dropping = true;
      i += m[0].length - 1;
    } else if (c === "|" || c === ">" || c === "<") {
      if (c === "|") combinedStatus = true;
      // `2>&1`: the fd number is part of the redirect, not an argument.
      if (/^\d+$/.test(word)) {
        word = "";
        inWord = false;
      }
      endWord();
      dropping = true;
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return { commands: out, combinedStatus };
}

const HEREDOC = /^<<(-?)[ \t]*(?:'(\w+)'|"(\w+)"|(\w+))/;

/** Where the line after a heredoc's closing delimiter starts (or the end). */
function heredocEnd(line: string, from: number, { delimiter, tabs }: { delimiter: string; tabs: boolean }) {
  let at = from;
  while (at < line.length) {
    const nl = line.indexOf("\n", at);
    const end = nl < 0 ? line.length : nl;
    const text = line.slice(at, end);
    if ((tabs ? text.replace(/^\t+/, "") : text) === delimiter) return Math.min(end + 1, line.length);
    at = end + 1;
  }
  return line.length;
}

export function shellCommands(line: string) {
  return parseShell(line).commands;
}

export const isOculus = (w: string) => /^oculus(\.exe)?$/i.test(w.split(/[/\\]/).pop() ?? "");

export function parseArgs(words: string[], key: string): Args {
  const pos: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "--") {
      pos.push(...words.slice(i + 1));
      break;
    }
    const localBool = (w === "--replace" && key === "memory write") ||
      (w === "-s" && (key === "list" || key === "run"));
    if (!w.startsWith("-") || w === "-") {
      pos.push(w);
      continue;
    }
    const eq = w.indexOf("=");
    if (w.startsWith("--") && eq > 0) {
      flags.set(w.slice(0, eq), w.slice(eq + 1));
    } else if (!localBool && !BOOL_FLAGS.has(w) && i + 1 < words.length && !words[i + 1].startsWith("-")) {
      flags.set(w, words[++i]);
    } else {
      flags.set(w, true);
    }
  }
  return { pos, flags };
}

export function flag(a: Args, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = a.flags.get(n);
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}

export const base = (p: string) => p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? p;
export const code = (c: string | undefined) => (c ? displayCode(c) : undefined);
export const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;

/** `todo` → "To do", `in-review` → "In review". */
export function column(c: string): string {
  if (c.toLowerCase() === "todo") return "To do";
  const s = c.replace(/[-_]+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The course a library path sits under, `courses/COMP30026_2026_SM2/…`. */
export function pathCourse(p: string): string | undefined {
  return /(?:^|[/\\])courses[/\\]([^/\\]+)/.exec(p)?.[1];
}
