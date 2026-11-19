import type { ToolMeta } from "./types";
import { words, type Wording } from "./cliRow";

export type CliState = "live" | "done" | "failed" | "refused" | "stopped";

export function cliState(meta: ToolMeta, running: boolean): CliState {
  if (meta.review?.status === "denied") return "refused";
  if (meta.review?.status === "aborted" || meta.review?.status === "timed_out") return "stopped";
  if (meta.ok == null) return running ? "live" : "stopped";
  if (!meta.ok && /^the (turn|session) ended before this finished$/.test(meta.output ?? "")) return "stopped";
  return meta.ok ? "done" : "failed";
}

function resultText(output: string) {
  return output.replace(/\x1b\[[0-9;]*m/g, "").replace(/\nexit code \d+\s*$/, "").trim();
}

function resultObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function refusedWrite(key: string, output: string): boolean {
  const text = resultText(output);
  const result = resultObject(text);
  if (key === "memory write" && (["body_replacement_required", "invalid_existing_memory"].includes(result?.code)
    || /^(?:error: )?(?:This memory already has text\.|cannot parse existing memory )/.test(text))) return true;
  const error = result?.error ?? text;
  return typeof error === "string" && /^(?:error: )?(?:propose this with `|Revision deletion belongs to the student|authentication and credential broker commands must be run by the student)/.test(error);
}

const memoryOutcomes = new Map<string, Wording>([
  ["created", words("Writing", "Created", "a memory", "{} memories")],
  ["metadata updated", words("Writing", "Updated", "memory metadata")],
  ["body replaced", words("Writing", "Replaced", "memory body", "{} memory bodies")],
  ["unchanged", words("Writing", "Left", "memory unchanged", "{} memories unchanged")],
]);

export function memoryWording(output: string) {
  const text = resultText(output);
  const outcome = resultObject(text)?.outcome;
  const human = /^(created|metadata updated|body replaced|unchanged) \S+ in /.exec(text);
  return memoryOutcomes.get(typeof outcome === "string" ? outcome.replace(/_/g, " ") : human?.[1] ?? "");
}

export function draftedCount(output: string): number | undefined {
  const ids = resultObject(resultText(output))?.ids;
  return Array.isArray(ids) && ids.length && ids.every(Number.isSafeInteger) ? ids.length : undefined;
}
