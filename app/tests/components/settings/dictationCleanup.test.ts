import { describe, expect, test } from "bun:test";
import { engineLine } from "@/components/settings/transcription/DictationCleanup";
import type { S1MiniStatus } from "@/lib/dictation/cleanup";

const s1 = (patch: Partial<S1MiniStatus> = {}): S1MiniStatus => ({
  name: "S1-mini",
  by: "Superwhisper",
  label: "S1-mini by Superwhisper",
  status: "missing",
  bytes: 484_227_000,
  running: false,
  englishOnly: true,
  ...patch,
});

describe("the dictation cleanup line", () => {
  test("says nothing until the key and S1-mini's status have answered", () => {
    expect(engineLine(null, s1()).text.trim()).toBe("");
    expect(engineLine(true, null).text.trim()).toBe("");
  });

  test("Groq comes first with a key, S1-mini named as its fallback once downloaded", () => {
    expect(engineLine(true, s1())).toEqual({ text: "Groq's Qwen 3.8 27B, using your Groq key.", warn: false });
    expect(engineLine(true, s1({ status: "present" })).text).toBe(
      "Groq's Qwen 3.8 27B, using your Groq key. S1-mini by Superwhisper steps in if Groq fails.",
    );
  });

  test("S1-mini answers without a key, unless it cannot run here", () => {
    expect(engineLine(false, s1({ status: "present" }))).toEqual({
      text: "S1-mini by Superwhisper, on this Mac.",
      warn: false,
    });
    expect(engineLine(false, s1({ status: "present", unavailable: "the llama-server helper is missing" })).warn).toBe(true);
  });

  test("with neither, it warns", () => {
    expect(engineLine(false, s1()).warn).toBe(true);
    expect(engineLine(false, s1({ status: "downloading" })).warn).toBe(true);
  });
});
