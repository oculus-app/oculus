import { describe, expect, test } from "bun:test";
import {
  AGENTS_DIR,
  ATTACHMENTS_DIR,
  DB_PATH,
  MEMORIES_DIR,
  NOTEBOOK_PAGES_DIR,
  OUTPUTS_DIR,
  STUDIO_DIR,
  inAgentsDir,
  inMemoriesDir,
  inNotebookPagesDir,
  stateRel,
} from "@/lib/files/statePaths";

describe("the app's own folders", () => {
  test("sit in .oculus/ at the top of the data dir", () => {
    expect([DB_PATH, AGENTS_DIR, ATTACHMENTS_DIR, OUTPUTS_DIR, MEMORIES_DIR, STUDIO_DIR, NOTEBOOK_PAGES_DIR]).toEqual([
      ".oculus/oculus.db",
      ".oculus/agents",
      ".oculus/agents/attachments",
      ".oculus/agents/outputs",
      ".oculus/agents/memories",
      ".oculus/studio",
      ".oculus/whiteboard-pages",
    ]);
  });

  test("a folder an older row names at the top is the one in .oculus/", () => {
    expect(stateRel("agents/outputs/a.md")).toBe(".oculus/agents/outputs/a.md");
    expect(stateRel("agents")).toBe(".oculus/agents");
    expect(stateRel("studio/videos/minimax/script.md")).toBe(".oculus/studio/videos/minimax/script.md");
    expect(stateRel("whiteboard-pages/7/page-004.png")).toBe(".oculus/whiteboard-pages/7/page-004.png");
    expect(stateRel("canvas-pages/7/page-004.png")).toBe(".oculus/whiteboard-pages/7/page-004.png");
  });

  test("a path already there, a course and a look-alike name stay as written", () => {
    for (const path of [
      ".oculus/agents/outputs/a.md",
      ".oculus/whiteboard-pages/7/page-004.png",
      "courses/X/Course/Files/a.pdf",
      "courses/X/agents/a.md",
      "agents-old/a.md",
      "studios/a.md",
      "",
    ]) {
      expect(stateRel(path)).toBe(path);
    }
  });

  test("the folder tests read a path as it is on disk", () => {
    expect(inAgentsDir(".oculus/agents/outputs/a.png")).toBe(true);
    expect(inAgentsDir("agents/outputs/a.png")).toBe(false);
    expect(inAgentsDir("courses/X/.oculus/agents/a.md")).toBe(false);
    expect(inMemoriesDir(".oculus/agents/memories/")).toBe(true);
    expect(inMemoriesDir(".oculus/agents/outputs/memories/a.md")).toBe(false);
    expect(inNotebookPagesDir(".oculus/whiteboard-pages/7/page-004.png")).toBe(true);
    expect(inNotebookPagesDir(".oculus/agents/whiteboard-pages/a.png")).toBe(false);
  });
});
