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

export interface UsageSummary {
  /** "today" when the parts are requests per day, else "this minute". */
  window: "today" | "this minute";
  /** "1,986 of 2,000 transcriptions", one per model with figures. */
  parts: string[];
  /** Any part is under a tenth of its limit. */
  warn: boolean;
  /** Every figure with its reset, one per line, then when it was read. */
  detail: string;
}

const NOUNS = {
  transcription: ["transcriptions", "transcription tokens"],
  cleanup: ["cleanups", "cleanup tokens"],
} as const;

const count = (n: number) => n.toLocaleString("en-US");
const capital = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** A reset in words: seconds when it is under a minute away, else the time. */
function resetPhrase(readAt: number, seconds: number | undefined): string {
  if (seconds === undefined) return "";
  if (seconds < 60) return `, resets ${Math.max(1, Math.round(seconds))} s after it was read`;
  return `, resets at ${clock(readAt + seconds * 1000)}`;
}

type Figure = { remaining: number; limit: number; reset?: number };

function figure(remaining?: number, limit?: number, reset?: number): Figure | null {
  return remaining !== undefined && limit !== undefined && limit > 0 ? { remaining, limit, reset } : null;
}

/**
 * The line and tooltip for a set of readings: requests per day when any
 * reading has them, else tokens per minute; null when neither is there.
 */
export function summarizeUsage(usage: DictationUsage): UsageSummary | null {
  const readings = (["transcription", "cleanup"] as const)
    .map((role) => usage[role])
    .filter((r): r is GroqReading => r !== undefined);
  if (!readings.length) return null;
  const requests = readings.map((r) => [r, figure(r.requestsRemaining, r.requestsLimit, r.requestsReset)] as const);
  const tokens = readings.map((r) => [r, figure(r.tokensRemaining, r.tokensLimit, r.tokensReset)] as const);
  const byDay = requests.some(([, f]) => f);
  const shown = (byDay ? requests : tokens).filter((pair): pair is readonly [GroqReading, Figure] => pair[1] !== null);
  if (!shown.length) return null;
  const noun = (r: GroqReading, perMinute: boolean) => NOUNS[r.role][perMinute ? 1 : 0];

  const lines: string[] = [];
  for (const r of readings) {
    const day = figure(r.requestsRemaining, r.requestsLimit, r.requestsReset);
    const minute = figure(r.tokensRemaining, r.tokensLimit, r.tokensReset);
    if (day) lines.push(`${capital(noun(r, false))}: ${count(day.remaining)} of ${count(day.limit)} left today${resetPhrase(r.readAt, day.reset)}.`);
    if (minute) lines.push(`${capital(noun(r, true))}: ${count(minute.remaining)} of ${count(minute.limit)} left this minute${resetPhrase(r.readAt, minute.reset)}.`);
  }
  const latest = Math.max(...readings.map((r) => r.readAt));
  lines.push(`Read from Groq's reply at ${clock(latest)}.`);

  return {
    window: byDay ? "today" : "this minute",
    parts: shown.map(([r, f]) => `${count(f.remaining)} of ${count(f.limit)} ${noun(r, !byDay)}`),
    warn: shown.some(([, f]) => f.remaining < f.limit / 10),
    detail: lines.join("\n"),
  };
}

/** The readings for Settings: each role's latest model. */
export function usageByRole(models: GroqReading[]): DictationUsage {
  const latest = (role: GroqReading["role"]) =>
    models.filter((m) => m.role === role).sort((a, b) => b.readAt - a.readAt)[0];
  return { transcription: latest("transcription"), cleanup: latest("cleanup") };
}
