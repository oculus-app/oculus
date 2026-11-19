import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { checkCliRows, commandPaths, compareCliRows, minimumPaths, readReference } from "../../scripts/check-cli-rows";
import { cliExclusions, cliRegistry } from "../../src/lib/harness/oculusCli";

const reference = new URL("../../../docs/cli-reference.md", import.meta.url);
const markdown = readFileSync(reference, "utf8");
const exclusions = Object.values(cliExclusions).flat();
const registryFile = "app/src/lib/harness/oculusCli.ts";

// Warn-only: a coverage gap prints here (a GitHub annotation in CI) and never fails the run.
test("the real reference parses and the real registry is checked against it", () => {
  checkCliRows();
  expect(readReference().size).toBeGreaterThanOrEqual(minimumPaths);
});

test("a registry missing one entry warns, naming the command and the file, without throwing", () => {
  const registry = cliRegistry.filter(entry => entry.key !== "widget check");
  const local: string[] = [];
  const ci: string[] = [];
  checkCliRows({ registry, github: false, warn: m => local.push(m) });
  checkCliRows({ registry, github: true, warn: m => ci.push(m) });
  expect(local).toEqual([expect.stringMatching(/^\[oculus CLI rows\] Update app\/src\/lib\/harness\/oculusCli\.ts/)]);
  expect(local[0]).toContain("Missing rows: oculus widget check");
  expect(ci).toHaveLength(1);
  expect(ci[0]).toStartWith(`::warning file=${registryFile}::`);
  expect(ci[0]).toContain("%0AMissing rows: oculus widget check");
  expect(ci[0]).not.toContain("\n");
});

test("stale keys, stale exclusions and wrong group flags warn in one block", () => {
  const registry = [
    ...cliRegistry.map(entry => entry.key === "studio voices" ? { ...entry, group: undefined }
      : entry.key === "widget check" ? { ...entry, group: true as const } : entry),
    { key: "obsolete" },
  ];
  const warnings: string[] = [];
  checkCliRows({ registry, exclusions: [...exclusions, "auth obsolete", "status"], github: false, warn: m => warnings.push(m) });
  expect(warnings).toHaveLength(1);
  const lines = warnings[0].split("\n").slice(1);
  expect(lines).toEqual([
    "Stale keys: oculus obsolete",
    "Stale exclusions: oculus auth obsolete, oculus status",
    "Need group: true: oculus studio voices",
    "Groups without subcommands: oculus widget check",
  ]);
});

test("a deeper verb needs its own row; its family's group entry does not cover it", () => {
  const registry = cliRegistry.filter(entry => entry.key !== "studio components show" && entry.key !== "memory fold");
  expect(compareCliRows(readReference(), registry, exclusions)).toEqual([
    ["Missing rows", ["memory fold", "studio components show"]],
  ]);
});

test("a complete mapping of the reference is quiet and repeatable", () => {
  const paths = commandPaths(markdown.replaceAll("\n", "\r\n"));
  const parents = new Set([...paths].map(p => p.split(" ").slice(0, -1).join(" ")));
  const registry = [...paths].filter(key => !exclusions.includes(key))
    .map(key => parents.has(key) ? { key, group: true as const } : { key });
  const warnings: string[] = [];
  const options = { registry: [...registry, { key: "*", fallback: true as const }], exclusions, warn: (s: string) => warnings.push(s) };
  checkCliRows(options);
  checkCliRows(options);
  expect(warnings).toBeEmpty();
});

test("a missing, corrupt or truncated reference fails with a clear message", () => {
  expect(() => checkCliRows({ file: new URL("missing/cli-reference.md", reference) })).toThrow(/Invalid docs\/cli-reference\.md: cannot read .*ENOENT/);
  expect(() => commandPaths("")).toThrow(/fenced clap help/);
  expect(() => commandPaths("garbage")).toThrow(/fenced clap help/);
  expect(() => commandPaths(markdown.split("## `oculus status`")[0])).toThrow(/expected at least 110/);
  expect(() => commandPaths(markdown.trimEnd().slice(0, -3))).toThrow(/fenced clap help/);
  expect(() => commandPaths(markdown.replace("## `oculus status`", "### `oculus status`"))).toThrow(/malformed command heading/);
  expect(() => commandPaths(markdown.replace("Usage: oculus status", "Usage: oculus example"))).toThrow(/mismatched usage/);
  expect(() => commandPaths(markdown.slice(0, markdown.lastIndexOf("\n## `oculus agent`")))).toThrow(/missing heading for oculus agent/);
});

test("the script predev runs exits 0 on the real reference and 1 on a missing one", () => {
  const cwd = new URL("../..", import.meta.url).pathname;
  expect(spawnSync("bun", ["scripts/check-cli-rows.ts"], { cwd }).status).toBe(0);
  const broken = spawnSync("bun", ["scripts/check-cli-rows.ts", "missing.md"], { cwd, encoding: "utf8" });
  expect(broken.status).toBe(1);
  expect(broken.stderr).toContain("[oculus CLI rows] Invalid docs/cli-reference.md: cannot read missing.md (ENOENT)");
});
