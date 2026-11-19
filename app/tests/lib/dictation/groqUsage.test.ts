import { describe, expect, test } from "bun:test";
import { resetsIn, rowCount, usageByRole, usageRows, type GroqReading } from "@/lib/dictation/groqUsage";

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

describe("Groq's allowance", () => {
  test("Settings takes each role's latest model", () => {
    const older = { ...whisper, model: "whisper-large-v3", readAt: READ_AT - 1000 };
    expect(usageByRole([older, qwen, whisper])).toEqual({ transcription: whisper, cleanup: qwen });
  });
});

describe("the figures the toast and Settings show", () => {
  test("a row per reading, requests per day first", () => {
    const rows = usageRows({ transcription: whisper, cleanup: qwen });
    expect(rows.map((r) => `${rowCount(r)} ${r.noun} ${r.window}`)).toEqual([
      "1,986 transcriptions today",
      "1,996 cleanups today",
    ]);
    expect(rows[0].resetsAt).toBe(READ_AT + 179_560);
    expect(rows.some((r) => r.warn)).toBe(false);
  });

  test("tokens per minute only for a reading without requests", () => {
    const rows = usageRows({ cleanup: reading({ role: "cleanup", tokensLimit: 6000, tokensRemaining: 500 }) });
    expect(rows).toHaveLength(1);
    expect(rows[0].noun).toBe("cleanup tokens");
    expect(rows[0].window).toBe("this minute");
    expect(rows[0].warn).toBe(true);
    expect(rows[0].resetsAt).toBeUndefined();
    expect(usageRows({ transcription: reading() })).toEqual([]);
  });

  test("under a tenth warns, and figures stay within the limit", () => {
    const [row] = usageRows({ transcription: reading({ requestsLimit: 2000, requestsRemaining: 199 }) });
    expect(row.warn).toBe(true);
    const [over] = usageRows({ transcription: reading({ requestsLimit: 2000, requestsRemaining: 2400 }) });
    expect(over.remaining).toBe(2000);
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
