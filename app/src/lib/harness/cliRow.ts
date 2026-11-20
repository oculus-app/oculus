import type { Args } from "./cliArgs";

export type CliIcon = "memory" | "search" | "file" | "folder" | "calendar" | "task" | "project"
  | "tag" | "lecture" | "studio" | "library" | "cheat" | "quiz" | "artifact" | "topic"
  | "widget" | "index" | "agent" | "voice";

export type Emphasis = (args: Args) => string | undefined;

export interface Wording {
  live: (n: number) => string;
  done: (n: number) => string;
  tally: (n: number) => string;
}

/** A repeated action counts its objects, or its invocations if it has no counted object. */
export function words(live: string, done: string, one = "", many?: string): Wording {
  const phrase = (verb: string, n: number) => {
    if (n > 1 && many) return verb + " " + many.replace("{}", String(n));
    const title = [verb, one].filter(Boolean).join(" ");
    return n > 1 ? `${title} ${n} times` : title;
  };
  return {
    live: n => phrase(live, n),
    done: n => phrase(done, n),
    tally: n => phrase(done.charAt(0).toLowerCase() + done.slice(1), n).replace(/ (for|from|in|into|to)$/, ""),
  };
}

export interface CliEntry {
  key: string;
  icon: CliIcon;
  wording: (a: Args) => Wording;
  emphasis: Emphasis;
  writes: boolean;
  group?: true;
  fallback?: true;
}

export function row(key: string, icon: CliIcon, wording: Wording | CliEntry["wording"],
  emphasis: Emphasis = () => undefined, writes = false): CliEntry {
  return { key, icon, wording: typeof wording === "function" ? wording : () => wording, emphasis, writes };
}

export function group(key: string, icon: CliIcon): CliEntry {
  return { ...row(key, icon, words("Opening command help", "Opened command help"), () => key), group: true };
}
