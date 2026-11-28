import { describe, expect, test } from "bun:test";
import * as cleanup from "@/components/settings/transcription/DictationCleanup";
import type { S1MiniStatus } from "@/lib/dictation/cleanup";
import type { CleanupChoice } from "@/lib/lectures/transcribe";

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
const present = s1({ status: "present" });
const groq = (fallback: boolean): CleanupChoice => ({ model: "groq", fallback });
const local = (fallback: boolean): CleanupChoice => ({ model: "s1Mini", fallback });
const off: CleanupChoice = { model: "off", fallback: false };

/** Both lines as a Mac, or another platform, words them, whatever runs the test. */
const lines = (mac: boolean) => ({
  modelLine: (choice: CleanupChoice | null, connected: boolean | null, status: S1MiniStatus | null) =>
    cleanup.modelLine(choice, connected, status, mac),
  fallbackLine: (choice: CleanupChoice | null, connected: boolean | null, status: S1MiniStatus | null) =>
    cleanup.fallbackLine(choice, connected, status, mac),
});
const { modelLine, fallbackLine } = lines(true);
const elsewhere = lines(false);

describe("the model's line", () => {
  test("blank until the choice and the chosen model's status are read", () => {
    expect(modelLine(null, true, present).text.trim()).toBe("");
    expect(modelLine(groq(true), null, present).text.trim()).toBe("");
    expect(modelLine(local(false), true, null).text.trim()).toBe("");
  });

  test("Off needs nothing", () => {
    expect(modelLine(off, null, null)).toEqual({ text: "Dictation joins your draft as heard.", warn: false });
  });

  test("Groq says whether its key is there", () => {
    expect(modelLine(groq(true), true, null)).toEqual({ text: "Runs on Groq with your key.", warn: false });
    expect(modelLine(groq(true), false, present)).toEqual({ text: "No Groq key: add one above.", warn: true });
  });

  test("S1-mini says where it runs, and what keeps it from running", () => {
    expect(modelLine(local(false), null, present)).toEqual({
      text: "Runs on this Mac; dictation never goes to Groq.",
      warn: false,
    });
    expect(modelLine(local(true), true, present).text).toBe("Runs on this Mac.");
    expect(modelLine(local(false), true, s1())).toEqual({ text: "Not downloaded: download it below.", warn: true });
    expect(modelLine(local(false), true, s1({ status: "present", unavailable: "the helper is missing" })).warn).toBe(true);
  });
});

describe("the fallback's line", () => {
  test("none for Off", () => {
    expect(fallbackLine(off, true, present)).toBeNull();
    expect(fallbackLine(null, true, present)).toBeNull();
  });

  test("names the other model, and warns only when it is on and not set up", () => {
    expect(fallbackLine(groq(true), true, present)).toEqual({
      text: "S1-mini by Superwhisper steps in if Groq fails or isn't set up.",
      warn: false,
    });
    expect(fallbackLine(groq(false), true, s1()).warn).toBe(false);
    expect(fallbackLine(groq(true), true, s1())).toEqual({
      text: "S1-mini by Superwhisper steps in if Groq fails or isn't set up. Download it below to use it.",
      warn: true,
    });
    expect(fallbackLine(local(true), false, present)).toEqual({
      text: "Groq steps in if S1-mini fails or isn't set up. Add a Groq key above to use it.",
      warn: true,
    });
    expect(fallbackLine(local(true), null, present)?.warn).toBe(false);
  });
});

describe("off a Mac", () => {
  test("S1-mini can't run, downloaded or not", () => {
    const cannot = { text: "S1-mini can't run here: choose another model.", warn: true };
    expect(elsewhere.modelLine(local(false), true, s1())).toEqual(cannot);
    expect(elsewhere.modelLine(local(true), true, s1({ status: "present", unavailable: "it needs a Mac" }))).toEqual(cannot);
    expect(elsewhere.modelLine(local(false), true, null).text.trim()).toBe("");
  });

  test("Groq and Off read as on a Mac", () => {
    expect(elsewhere.modelLine(groq(true), true, null)).toEqual(modelLine(groq(true), true, null));
    expect(elsewhere.modelLine(groq(true), false, s1())).toEqual(modelLine(groq(true), false, s1()));
    expect(elsewhere.modelLine(off, null, null)).toEqual(modelLine(off, null, null));
  });

  test("there is no fallback to offer", () => {
    expect(elsewhere.fallbackLine(groq(true), true, s1())).toBeNull();
    expect(elsewhere.fallbackLine(local(true), false, present)).toBeNull();
  });
});
