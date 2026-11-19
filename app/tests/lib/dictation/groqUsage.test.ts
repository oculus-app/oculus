import { describe, expect, test } from "bun:test";
import { resetsIn, rowFigure, summarizeUsage, usageByRole, usageRows, type GroqReading } from "@/lib/dictation/groqUsage";
import { usageText } from "@/components/settings/transcription/DictationCleanup";

const READ_AT = new Date(2026, 10, 19, 14, 2).getTime();

const reading = (patch: Partial<GroqReading> = {}): GroqReading => ({
  model: "whisper-large-v3-turbo",
  role: "transcription",
  readAt: READ_AT,
  ...patch,
});

const whisper = reading({ requestsLimit: 2000, requestsRemaining: 1986, requestsReset: 179.56 });
const qwen = reading({
  model: "qwen/qwen3.8-27b",
  role: "cleanup",
  requestsLimit: 2000,
  requestsRemaining: 1996,
  requestsReset: 43.2,
  tokensLimit: 6000,
  tokensRemaining: 5800,
  tokensReset: 7.66,
});

describe("Groq's allowance after a dictation", () => {
  test("names requests per day for each model Groq answered, in tabular figures", () => {
    const summary = summarizeUsage({ transcription: whisper, cleanup: qwen })!;
    expect(summary.window).toBe("today");
    expect(summary.parts).toEqual(["1,986 of 2,000 transcriptions", "1,996 of 2,000 cleanups"]);
    expect(summary.warn).toBe(false);
    expect(usageText(summary)).toBe("Today: 1,986 of 2,000 transcriptions · 1,996 of 2,000 cleanups left");
  });

  test("only the parts that exist", () => {
    expect(summarizeUsage({ cleanup: qwen })!.parts).toEqual(["1,996 of 2,000 cleanups"]);
    expect(summarizeUsage({})).toBeNull();
    expect(summarizeUsage({ transcription: reading() })).toBeNull();
    expect(summarizeUsage({ transcription: reading({ requestsRemaining: 5 }) })).toBeNull();
  });

  test("falls back to tokens per minute when no reading has requests", () => {
    const summary = summarizeUsage({ cleanup: reading({ role: "cleanup", tokensLimit: 6000, tokensRemaining: 500 }) })!;
    expect(summary.window).toBe("this minute");
    expect(summary.parts).toEqual(["500 of 6,000 cleanup tokens"]);
    expect(summary.warn).toBe(true);
  });

  test("warns when any shown figure is under a tenth of its limit", () => {
    const low = reading({ requestsLimit: 2000, requestsRemaining: 199 });
    expect(summarizeUsage({ transcription: low, cleanup: qwen })!.warn).toBe(true);
    expect(summarizeUsage({ transcription: reading({ requestsLimit: 2000, requestsRemaining: 200 }) })!.warn).toBe(false);
  });

  test("the tooltip carries every figure with its reset and when it was read", () => {
    const lines = summarizeUsage({ transcription: whisper, cleanup: qwen })!.detail.split("\n");
    expect(lines[0]).toMatch(/^Transcriptions: 1,986 of 2,000 left today, resets at .+\.$/);
    expect(lines[1]).toBe("Cleanups: 1,996 of 2,000 left today, resets 43 s after it was read.");
    expect(lines[2]).toBe("Cleanup tokens: 5,800 of 6,000 left this minute, resets 8 s after it was read.");
    expect(lines[3]).toMatch(/^Read from Groq's reply at /);
  });

  test("Settings takes each role's latest model", () => {
    const older = { ...whisper, model: "whisper-large-v3", readAt: READ_AT - 1000 };
    expect(usageByRole([older, qwen, whisper])).toEqual({ transcription: whisper, cleanup: qwen });
    expect(usageText(null)).toBeNull();
  });
});

describe("the toast's meters", () => {
  test("a row per reading, requests per day first", () => {
    const rows = usageRows({ transcription: whisper, cleanup: qwen });
    expect(rows.map((r) => r.label)).toEqual(["Transcriptions today", "Cleanups today"]);
    expect(rows.map(rowFigure)).toEqual(["1,986 of 2,000 left", "1,996 of 2,000 left"]);
    expect(rows[0].left).toBeCloseTo(0.993);
    expect(rows[0].resetsAt).toBe(READ_AT + 179_560);
    expect(rows.some((r) => r.warn)).toBe(false);
  });

  test("tokens per minute only for a reading without requests", () => {
    const rows = usageRows({ cleanup: reading({ role: "cleanup", tokensLimit: 6000, tokensRemaining: 500 }) });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Cleanup tokens this minute");
    expect(rows[0].warn).toBe(true);
    expect(rows[0].resetsAt).toBeUndefined();
    expect(usageRows({ transcription: reading() })).toEqual([]);
  });

  test("under a tenth warns, and figures stay within the limit", () => {
    const [row] = usageRows({ transcription: reading({ requestsLimit: 2000, requestsRemaining: 199 }) });
    expect(row.warn).toBe(true);
    const [over] = usageRows({ transcription: reading({ requestsLimit: 2000, requestsRemaining: 2400 }) });
    expect(over.left).toBe(1);
  });

  test("resets read as a countdown", () => {
    expect(resetsIn(READ_AT + 43_200, READ_AT)).toBe("resets in 43s");
    expect(resetsIn(READ_AT + 179_560, READ_AT)).toBe("resets in 3m");
    expect(resetsIn(READ_AT + (3 * 3600 + 12 * 60) * 1000, READ_AT)).toBe("resets in 3h 12m");
    expect(resetsIn(READ_AT + 2 * 3600 * 1000, READ_AT)).toBe("resets in 2h");
    expect(resetsIn(READ_AT - 1000, READ_AT)).toBeNull();
    expect(resetsIn(undefined, READ_AT)).toBeNull();
  });
});
