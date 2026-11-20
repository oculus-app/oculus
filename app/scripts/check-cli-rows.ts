// Compares the generated CLI reference with the chat row registry. Gaps warn; a broken reference throws.
// `bun scripts/check-cli-rows.ts [reference.md]` exits 1 only when the reference cannot be read or parsed.
import { readFileSync } from "node:fs";
import { cliExclusions, cliRegistry } from "../src/lib/harness/oculusCli";

const reference = new URL("../../docs/cli-reference.md", import.meta.url);
const registryFile = "app/src/lib/harness/oculusCli.ts";
// The reference holds about 130 command paths. The floor lets ordinary removals through
// and catches a truncated or half-generated file.
export const minimumPaths = 110;

function invalid(reason: string): never {
  throw new Error(`Invalid docs/cli-reference.md: ${reason}`);
}

/** Each generated heading has one fenced clap help block. Its parent's Commands table
 * also names it, so dropping a whole section still leaves evidence of the missing path. */
export function commandPaths(markdown: string): Set<string> {
  const blocks = markdown.replace(/\r\n/g, "\n").trim().split(/^```$/m);
  if (blocks.length < 3 || blocks.length % 2 !== 1 || blocks.at(-1)?.trim()) invalid("expected fenced clap help");
  if (!/^# The `oculus` CLI$/m.test(blocks[0])) invalid("missing root CLI heading");

  const paths = new Set<string>();
  const children = new Set<string>();
  for (let i = 0; i < blocks.length - 1; i += 2) {
    let path = "";
    if (i > 0) {
      const heading = /^(#{2,}) `oculus ([\w-]+(?: [\w-]+)*)`$/.exec(blocks[i].trim());
      if (!heading || heading[1].length !== heading[2].split(" ").length + 1) invalid(`malformed command heading: ${blocks[i].trim()}`);
      path = heading[2];
      if (paths.has(path)) invalid(`duplicate heading for oculus ${path}`);
      paths.add(path);
    }
    const help = blocks[i + 1];
    const usage = /^Usage: oculus((?: [a-z0-9][\w-]*)*)(?= |$)/m.exec(help);
    if (!usage || usage[1].trim() !== path) invalid(`missing or mismatched usage for oculus ${path}`.trimEnd());
    const commands = help.split("\nCommands:\n")[1]?.split("\n\n", 1)[0];
    if (commands) {
      for (const match of commands.matchAll(/^  ([\w-]+)(?:\s|$)/gm)) {
        if (match[1] !== "help") children.add([path, match[1]].filter(Boolean).join(" "));
      }
    }
  }
  if (paths.size < minimumPaths) invalid(`found ${paths.size} command paths, expected at least ${minimumPaths}`);
  for (const child of children) if (!paths.has(child)) invalid(`missing heading for oculus ${child}`);
  for (const path of paths) if (!children.has(path)) invalid(`oculus ${path} is absent from its parent's help`);
  return paths;
}

export function readReference(file: URL | string = reference): Set<string> {
  let markdown: string;
  try {
    markdown = readFileSync(file, "utf8");
  } catch (e) {
    invalid(`cannot read ${String(file)} (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`);
  }
  return commandPaths(markdown);
}

type RegistryKey = { key: string; group?: true; fallback?: true };
const sorted = (paths: Iterable<string>) => [...paths].sort();

/** Every gap between the reference and the registry, by kind; empty kinds are left out. */
export function compareCliRows(paths: Set<string>, registry: readonly RegistryKey[], exclusions: readonly string[]) {
  const entries = registry.filter(entry => !entry.fallback);
  const keys = new Set(entries.map(entry => entry.key));
  const excluded = new Set(exclusions);
  const parents = new Set([...paths].filter(path => path.includes(" ")).map(path => path.slice(0, path.lastIndexOf(" "))));
  // The chat lookup walks deeper only through a group entry, so a family's flag
  // decides whether its verbs reach their own rows or borrow the family's wording.
  const gaps: [string, string[]][] = [
    ["Missing rows", sorted([...paths].filter(path => !keys.has(path) && !excluded.has(path)))],
    ["Stale keys", sorted([...keys].filter(key => !paths.has(key)))],
    ["Stale exclusions", sorted([...excluded].filter(path => !paths.has(path) || keys.has(path)))],
    ["Need group: true", sorted(entries.filter(e => !e.group && parents.has(e.key)).map(e => e.key))],
    ["Groups without subcommands", sorted(entries.filter(e => e.group && paths.has(e.key) && !parents.has(e.key)).map(e => e.key))],
  ];
  return gaps.filter(([, list]) => list.length);
}

/** One warning block for every gap, as a GitHub annotation on the registry under Actions. */
export function formatGaps(gaps: ReturnType<typeof compareCliRows>, github: boolean): string | undefined {
  if (!gaps.length) return undefined;
  const lines = gaps.map(([label, list]) => `${label}: ${list.map(path => "oculus " + path).join(", ")}`);
  const message = [`Update ${registryFile} to match docs/cli-reference.md: give each command a row or an exclusion with its reason.`, ...lines].join("\n");
  if (!github) return `[oculus CLI rows] ${message}`;
  const escaped = message.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
  return `::warning file=${registryFile}::${escaped}`;
}

export function checkCliRows({
  file = reference as URL | string,
  registry = cliRegistry as readonly RegistryKey[],
  exclusions = Object.values(cliExclusions).flat() as readonly string[],
  github = process.env.GITHUB_ACTIONS === "true",
  warn = console.warn,
} = {}): void {
  const message = formatGaps(compareCliRows(readReference(file), registry, exclusions), github);
  if (message) warn(message);
}

if (import.meta.main) {
  try {
    checkCliRows(process.argv[2] ? { file: process.argv[2] } : {});
  } catch (e) {
    console.error(`[oculus CLI rows] ${(e as Error).message}`);
    process.exit(1);
  }
}
