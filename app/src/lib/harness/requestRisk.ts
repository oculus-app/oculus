import { unwrapShell } from "./cliArgs";
import type { RequestDetail } from "./requests";
import type { HarnessRequest } from "./types";

/**
 * The tone and the fact chips the approval tray draws for a request. A
 * display hint only: it decides nothing about what is asked or answered,
 * Rust and the CLI do. When unsure it is never `safe`.
 */

export type RiskTone = "safe" | "caution" | "danger";

/** Which glyph a chip takes; the component maps it, so this stays DOM-free. */
export type RiskIcon =
  | "read"
  | "write"
  | "delete"
  | "network"
  | "sandbox"
  | "access"
  | "admin"
  | "script"
  | "git"
  | "disk"
  | "permissions"
  | "process";

export interface RiskChip {
  label: string;
  tone: RiskTone;
  icon: RiskIcon;
}

export interface RequestRisk {
  tone: RiskTone;
  chips: RiskChip[];
}

/** Read-only commands the tray may call safe, when nothing else is on the line. */
const READ_ONLY = new Set([
  "which", "ls", "pwd", "cat", "head", "tail", "wc", "grep", "rg", "file", "stat",
  "du", "date", "basename", "dirname", "realpath", "tree",
]);

/** Flags that make a read-only command write or run something. */
const WRITING_FLAGS: Record<string, RegExp> = {
  tree: /^-o/,
  rg: /^--pre(=|$)/,
  date: /^(-s|--set)/,
};

/** Characters that chain, redirect or substitute: a line holding one is never safe. */
const SHELL_SYNTAX = /[;&|<>`$(){}\\\n]/;

/** Words that run the next word as the command. */
const PREFIXES = new Set(["env", "nohup", "time", "exec", "command", "nice", "xargs", "builtin"]);

/** Each command of a line as its words, split at every chain, pipe or
 *  substitution (inside quotes too: over-reading only ever adds a chip). */
function commandsOf(line: string): string[][] {
  return line
    .split(/&&|\|\||[;|&\n`(){}]|\$\(|<\(/)
    .map((part) => part.replace(/["']/g, " ").trim().split(/\s+/).filter(Boolean))
    .map((words) => {
      let i = 0;
      while (i < words.length && (PREFIXES.has(base(words[i])) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i += 1;
      return words.slice(i);
    })
    .filter((words) => words.length > 0);
}

const base = (word: string) => word.split("/").pop() ?? word;

/** The destructive shapes, each with the fact it states. */
function dangerChips(commands: string[][]): RiskChip[] {
  const out: RiskChip[] = [];
  const add = (label: string, icon: RiskIcon) => {
    if (!out.some((c) => c.label === label)) out.push({ label, tone: "danger", icon });
  };
  const names = commands.map((words) => base(words[0]));
  for (const words of commands) {
    const name = base(words[0]);
    const rest = words.slice(1);
    if (name === "rm") add("Deletes files", "delete");
    if (name === "sudo") add("Runs as admin", "admin");
    if (name === "git") {
      const sub = gitSubcommand(rest);
      if (sub === "push" && rest.some((w) => w === "--force" || w === "-f" || w.startsWith("--force-with-lease"))) add("Discards git work", "git");
      if (sub === "reset" && rest.includes("--hard")) add("Discards git work", "git");
      if (sub === "clean") add("Discards git work", "git");
    }
    if (name === "dd" || name === "mkfs" || name.startsWith("mkfs.")) add("Writes to a disk", "disk");
    if (name === "diskutil" && rest.some((w) => /^erase/i.test(w))) add("Writes to a disk", "disk");
    if ((name === "chmod" || name === "chown") && rest.some((w) => w === "--recursive" || /^-[A-Za-z]*R/.test(w))) {
      add("Changes permissions", "permissions");
    }
    if (name === "kill" || name === "pkill" || name === "killall") add("Stops processes", "process");
  }
  const fetches = names.some((n) => n === "curl" || n === "wget");
  const shell = names.some((n) => n === "sh" || n === "bash" || n === "zsh");
  if (fetches && shell) add("Runs a downloaded script", "script");
  return out;
}

/** `git`'s subcommand, past its global options (`-C dir`, `-c k=v`). */
function gitSubcommand(words: string[]): string | null {
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (w === "-C" || w === "-c") {
      i += 1;
      continue;
    }
    if (!w.startsWith("-")) return w;
  }
  return null;
}

/** A single read-only command with nothing chained, redirected or substituted. */
function readOnly(line: string): boolean {
  if (SHELL_SYNTAX.test(line)) return false;
  const words = line.trim().split(/\s+/).filter(Boolean);
  const name = words[0];
  if (!name || !READ_ONLY.has(name)) return false;
  const writes = WRITING_FLAGS[name];
  return !writes || !words.slice(1).some((w) => writes.test(w));
}

export function requestRisk(request: HarnessRequest, detail: RequestDetail): RequestRisk {
  const toolKind = request.action === "tool" ? request.payload?.kind : null;
  const reachesNetwork =
    request.action === "network" ||
    detail.network ||
    !!detail.host ||
    toolKind === "fetch" ||
    toolKind === "search" ||
    detail.access.includes("Reach the network");
  const line = detail.command != null ? unwrapShell(detail.command) : null;

  const danger = line != null ? dangerChips(commandsOf(line)) : [];
  if (detail.outsideSandbox && (detail.network || !!detail.host)) {
    return {
      tone: "danger",
      chips: [
        ...danger,
        { label: "Network", tone: "danger", icon: "network" },
        { label: "Outside sandbox", tone: "danger", icon: "sandbox" },
      ],
    };
  }

  const facts: RiskChip[] = [];
  if (request.action === "file_change") {
    const deletes = detail.changes.length > 0 && detail.changes.every((c) => c.kind === "delete");
    facts.push(deletes ? { label: "Deletes", tone: "caution", icon: "delete" } : { label: "Writes", tone: "caution", icon: "write" });
  }
  if (reachesNetwork) facts.push({ label: "Network", tone: "caution", icon: "network" });
  if (detail.outsideSandbox) facts.push({ label: "Outside sandbox", tone: "caution", icon: "sandbox" });
  if (request.action === "permissions") facts.push({ label: "More access", tone: "caution", icon: "access" });

  if (danger.length > 0) return { tone: "danger", chips: [...danger, ...facts] };

  const safeCommand =
    request.action === "command" && !detail.outsideSandbox && !reachesNetwork && line != null && readOnly(line);
  if (safeCommand || (request.action === "tool" && toolKind === "read")) {
    return { tone: "safe", chips: [{ label: "Read-only", tone: "safe", icon: "read" }] };
  }
  return { tone: "caution", chips: facts };
}
