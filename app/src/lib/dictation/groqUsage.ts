import { invoke } from "@tauri-apps/api/core";

// What Groq's last answers said of its allowance (`transcribe/groq_usage.rs`):
// requests per day and tokens per minute, per model, from each successful
// response's rate-limit headers, kept in memory. Reading it never calls Groq.
// Audio seconds per day has no header, so it is never shown.

/** Mirrors `Reading`: a missing header leaves its field absent; resets are
 *  seconds after `readAt` (ms since the epoch). */
export interface GroqReading {
  model: string;
  role: "transcription" | "cleanup";
  requestsLimit?: number;
  requestsRemaining?: number;
  requestsReset?: number;
  tokensLimit?: number;
  tokensRemaining?: number;
  tokensReset?: number;
  readAt: number;
}

/** The latest reading of every Groq model used since launch. */
export function groqUsage(): Promise<{ models: GroqReading[] }> {
  return invoke<{ models: GroqReading[] }>("groq_usage");
}

/** The readings a dictation brought back, by what each model did. */
export interface DictationUsage {
  transcription?: GroqReading;
  cleanup?: GroqReading;
}

const NOUNS = {
  transcription: ["transcriptions", "transcription tokens"],
  cleanup: ["cleanups", "cleanup tokens"],
} as const;

/** "1,999". */
export const count = (n: number) => n.toLocaleString("en-US");
type Figure = { remaining: number; limit: number; reset?: number };

function figure(remaining?: number, limit?: number, reset?: number): Figure | null {
  return remaining !== undefined && limit !== undefined && limit > 0 ? { remaining, limit, reset } : null;
}

/** The readings for Settings: each role's latest model. */
export function usageByRole(models: GroqReading[]): DictationUsage {
  const latest = (role: GroqReading["role"]) =>
    models.filter((m) => m.role === role).sort((a, b) => b.readAt - a.readAt)[0];
  return { transcription: latest("transcription"), cleanup: latest("cleanup") };
}

/** One figure in the toast after a dictation: what Groq reported for a role. */
export interface UsageRow {
  role: GroqReading["role"];
  /** "transcriptions", "cleanup tokens". */
  noun: string;
  window: "today" | "this minute";
  remaining: number;
  limit: number;
  /** Under a tenth of the limit. */
  warn: boolean;
  /** When the figure resets, ms since the epoch; absent when Groq gave none. */
  resetsAt?: number;
}

/**
 * One row per reading: its requests per day when Groq sent them, else its
 * tokens per minute; a reading with neither has no row.
 */
export function usageRows(usage: DictationUsage): UsageRow[] {
  const rows: UsageRow[] = [];
  for (const role of ["transcription", "cleanup"] as const) {
    const r = usage[role];
    if (!r) continue;
    const day = figure(r.requestsRemaining, r.requestsLimit, r.requestsReset);
    const f = day ?? figure(r.tokensRemaining, r.tokensLimit, r.tokensReset);
    if (!f) continue;
    const remaining = Math.max(0, Math.min(f.remaining, f.limit));
    rows.push({
      role,
      noun: NOUNS[role][day ? 0 : 1],
      window: day ? "today" : "this minute",
      remaining,
      limit: f.limit,
      warn: remaining < f.limit / 10,
      resetsAt: f.reset === undefined ? undefined : r.readAt + f.reset * 1000,
    });
  }
  return rows;
}

/** "1,999". */
export const rowCount = (row: UsageRow) => count(row.remaining);

/** "resets in 3h 12m", "resets in 43s"; null once the reset has passed. */
export function resetsIn(resetsAt: number | undefined, now: number): string | null {
  if (resetsAt === undefined) return null;
  const seconds = Math.round((resetsAt - now) / 1000);
  if (seconds <= 0) return null;
  if (seconds < 60) return `resets in ${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `resets in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `resets in ${hours}h${rest ? ` ${rest}m` : ""}`;
}
