import { describe, expect, test } from "bun:test";
import { storageOwner, storageType } from "@/lib/files/storageGroups";

describe("Settings → Storage groups", () => {
  test("the database is the state folder's, with the files SQLite keeps beside it", () => {
    for (const path of [".oculus/oculus.db", ".oculus/oculus.db-wal", ".oculus/oculus.db-shm"]) {
      expect(storageType(path)).toBe("Database");
    }
    expect(storageType("courses/X/oculus.db")).toBe("Other");
    expect(storageType("courses/X/notes/oculus.db.md")).toBe("Markdown");
  });

  test("the app's own files take their type from their extension", () => {
    expect(storageType(".oculus/studio/videos/minimax/out.mp4")).toBe("Videos");
    expect(storageType(".oculus/agents/outputs/plot.PNG")).toBe("Images");
    expect(storageType(".oculus/agents/attachments/20261120-063301-0a1b2c3d.pdf")).toBe("PDFs");
    expect(storageType(".oculus/agents/memories/MEMORY.md")).toBe("Markdown");
    expect(storageType(".oculus/whiteboard-pages/7/page-004.png")).toBe("Images");
    expect(storageType(".oculus/models/whisper/ggml-large-v3-turbo.bin")).toBe("Other");
    expect(storageType(".oculus/voyage-usage.json")).toBe("Other");
    expect(storageType("courses/X/Course/Files/week 1.pdf")).toBe("PDFs");
  });

  test("a file is its subject's by folder, and everything in .oculus/ is the app's", () => {
    const subjects = new Map([["COMP30024_2026_SM2", "COMP30024"]]);
    const lectures = new Map([["L1", "COMP30024"]]);
    const owner = (path: string) => storageOwner(path, subjects, lectures);
    expect(owner("courses/COMP30024_2026_SM2/Course/Files/a.pdf")).toBe("COMP30024");
    expect(owner("courses/COMP30024_2026_SM2/.oculus/derived/Course/Files/a.pages.json")).toBe("COMP30024");
    for (const path of [
      ".oculus/oculus.db",
      ".oculus/models/whisper/ggml-large-v3-turbo.bin",
      ".oculus/agents/outputs/plot.png",
      ".oculus/studio/videos/minimax/out.mp4",
      ".oculus/whiteboard-pages/7/page-004.png",
      ".keyd.sock",
    ]) {
      expect(owner(path)).toBe("App data");
    }
    expect(owner("lectures/L1/source1.mp4")).toBe("COMP30024");
    expect(owner("lectures/L2/source1.mp4")).toBe("Lectures");
  });
});
