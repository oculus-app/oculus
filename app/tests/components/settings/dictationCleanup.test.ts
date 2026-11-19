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
  test("Off says dictation goes in as heard, whatever is set up", () => {
    expect(engineLine("off", null, null)).toEqual({ text: "Off: dictation joins your draft as heard.", warn: false });
    expect(engineLine("off", true, s1({ status: "present" })).warn).toBe(false);
  });

  test("says nothing until the stored choice has been read", () => {
    expect(engineLine(null, true, s1()).text.trim()).toBe("");
  });

  test("Groq alone names no fallback, and warns without a key", () => {
    expect(engineLine("groq", true, s1({ status: "present" }))).toEqual({
      text: "Groq's Qwen 3.8 27B, using your Groq key. Nothing steps in if Groq fails.",
      warn: false,
    });
    expect(engineLine("groq", false, s1({ status: "present" }))).toEqual({
      text: "Not set up: add a Groq key, or choose another cleanup.",
      warn: true,
    });
  });

  test("S1-mini alone ignores the Groq key, and warns until it is downloaded", () => {
    expect(engineLine("s1Mini", true, s1({ status: "present" }))).toEqual({
      text: "S1-mini by Superwhisper, on this Mac. Dictation never goes to Groq.",
      warn: false,
    });
    expect(engineLine("s1Mini", true, s1()).warn).toBe(true);
    expect(engineLine("s1Mini", false, s1({ status: "present", unavailable: "the llama-server helper is missing" }))).toEqual({
      text: "S1-mini by Superwhisper can't run here: choose another cleanup.",
      warn: true,
    });
  });

  test("says nothing until the key and S1-mini's status have answered", () => {
    expect(engineLine("auto", null, s1()).text.trim()).toBe("");
    expect(engineLine("auto", true, null).text.trim()).toBe("");
  });

  test("Groq comes first with a key, S1-mini named as its fallback once downloaded", () => {
    expect(engineLine("auto", true, s1())).toEqual({ text: "Groq's Qwen 3.8 27B, using your Groq key.", warn: false });
    expect(engineLine("auto", true, s1({ status: "present" })).text).toBe(
      "Groq's Qwen 3.8 27B, using your Groq key. S1-mini by Superwhisper steps in if Groq fails.",
    );
  });

  test("S1-mini answers without a key, unless it cannot run here", () => {
    expect(engineLine("auto", false, s1({ status: "present" }))).toEqual({
      text: "S1-mini by Superwhisper, on this Mac.",
      warn: false,
    });
    expect(engineLine("auto", false, s1({ status: "present", unavailable: "the llama-server helper is missing" })).warn).toBe(true);
  });

  test("with neither, it warns", () => {
    expect(engineLine("auto", false, s1()).warn).toBe(true);
    expect(engineLine("auto", false, s1({ status: "downloading" })).warn).toBe(true);
  });
});
