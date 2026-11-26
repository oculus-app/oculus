import { describe, expect, test } from "bun:test";
import { modeChoices, threadMode } from "@/lib/harness";

describe("the mode control's lines per bridge", () => {
  test("an agent with a reviewer: the three modes with their own lines", () => {
    const { note, choices } = modeChoices({ provider: "codex", approvals: true, autoReview: true });
    expect(note).toBeNull();
    expect(choices).toEqual([
      { mode: "ask", label: "Ask", line: "You approve what the sandbox blocks" },
      { mode: "auto", label: "Auto", line: "The agent's reviewer decides" },
      { mode: "quiet", label: "Don't ask", line: "Blocked actions are declined" },
    ]);
  });

  test("Claude's Auto says its classifier decides", () => {
    const { note, choices } = modeChoices({ provider: "claude", approvals: true, autoReview: true });
    expect(note).toBeNull();
    expect(choices[1].line).toBe("Classifier decides");
    expect(choices[0].line).toBe("You approve what the sandbox blocks");
  });

  test("Antigravity names native Auto and explains its access to the library", () => {
    const { note, choices } = modeChoices({ provider: "antigravity", approvals: true, autoReview: true });
    expect(choices[1].line).toBe("Antigravity's own Auto decides");
    expect(note).toBe("In Auto, Antigravity approves its own edits and commands. Course folders stay read-only. Oculus cannot keep it out of the database or other files on this Mac.");
  });

  test("Antigravity asks on platforms without the folder guard", () => {
    const { note, choices } = modeChoices({ provider: "antigravity", approvals: true, autoReview: false });
    expect(choices[1].line).toBe("Antigravity has no reviewer, so it asks");
    expect(note).toBeNull();
  });

  test("opencode has no reviewer and cannot open an approval", () => {
    const { note, choices } = modeChoices({ provider: "opencode", approvals: false, autoReview: false });
    expect(choices[1].line).toBe("opencode has no reviewer");
    expect(note).toBe("opencode cannot ask yet: anything its sandbox blocks is declined, whichever you choose.");
  });

  test("a chat with no saved mode asks", () => {
    expect(threadMode(undefined)).toBe("ask");
    expect(threadMode("auto")).toBe("auto");
  });
});
