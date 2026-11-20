import { afterAll, describe, expect, mock, test } from "bun:test";
import { FILE_SCRAPED_EVENT, type FileScraped } from "@/lib/pipeline/syncRunner";

// The modules stay real but for the one call each; later test files import them too.
let answer: (command: string, args: Record<string, unknown>) => Promise<unknown> = async () => {
  throw new Error("Tauri is not available");
};
const tauri = { ...(await import("@tauri-apps/api/core")) };
mock.module("@tauri-apps/api/core", () => ({ ...tauri, invoke: (c: string, a: Record<string, unknown>) => answer(c, a) }));
let subjects: () => Promise<unknown[]> | null = () => null;
const db = { ...(await import("@/lib/db")) };
mock.module("@/lib/db", () => ({ ...db, getSubjects: () => subjects() ?? db.getSubjects() }));

const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
globals.window ??= new EventTarget();
afterAll(() => {
  answer = async () => { throw new Error("Tauri is not available"); };
  subjects = () => null;
  if (!hadWindow) delete globals.window;
});

const { resyncSummary, resyncWorkspace, WORKSPACE_RESYNCED_EVENT } = await import("@/lib/ed/workspace");

const SLIDE_MD = "courses/COMP30026/Course/Lessons/1-l/03-q1a.md";
const DIR = "courses/COMP30026/Course/Lessons/1-l/03-q1a";
const slide = { subjectId: 7, challengeId: 281410, title: "Q1a", slideMd: SLIDE_MD };

const scraped = (relative_path: string, subject_id = 7) =>
  window.dispatchEvent(
    new CustomEvent<FileScraped>(FILE_SCRAPED_EVENT, { detail: { subject_id, canvas_id: null, relative_path } }),
  );

describe("a challenge's resync", () => {
  test("names the slide to Rust, answers at once, and reloads once its rows are written", async () => {
    subjects = async () => [{ id: 7, code: "COMP30026_2026_SM2" }];
    let asked: Record<string, unknown> | null = null;
    // The listener writes rows after the command has answered.
    answer = async (command, args) => {
      expect(command).toBe("ed_resync_workspace");
      asked = args;
      setTimeout(() => {
        scraped(`${DIR}/a.py`);
        scraped(`${DIR}/b.py`, 8);
        scraped(`${DIR}-other/c.py`);
        scraped(`${DIR}/src/d.py`);
      }, 5);
      setTimeout(() => scraped(`${DIR}/gone.py`), 15);
      return { added: 1, updated: 1, unchanged: 0, removed: 1 };
    };
    const reloads: unknown[] = [];
    const onReload = (e: Event) => reloads.push((e as CustomEvent).detail);
    window.addEventListener(WORKSPACE_RESYNCED_EVENT, onReload);
    let rowsAtReload = -1;
    let rows = 0;
    const countRow = () => rows++;
    window.addEventListener(FILE_SCRAPED_EVENT, countRow);
    window.addEventListener(WORKSPACE_RESYNCED_EVENT, () => (rowsAtReload = rows), { once: true });

    const result = await resyncWorkspace(slide);
    // Answered before any row landed: the spinner is not held by them.
    expect(rows).toBe(0);
    expect(reloads).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 30));

    window.removeEventListener(WORKSPACE_RESYNCED_EVENT, onReload);
    window.removeEventListener(FILE_SCRAPED_EVENT, countRow);
    expect(result).toEqual({ added: 1, updated: 1, unchanged: 0, removed: 1 });
    expect(asked!).toEqual({
      subjectId: 7,
      subjectCode: "COMP30026_2026_SM2",
      challengeId: 281410,
      slideTitle: "Q1a",
      slideMd: SLIDE_MD,
    });
    expect(reloads).toEqual([{ subjectId: 7 }]);
    expect(rowsAtReload).toBe(5);
  });

  test("a failed fetch rejects with Rust's message and reloads nothing", async () => {
    subjects = async () => [{ id: 7, code: "COMP30026" }];
    answer = async () => {
      throw "could not reach the workspace server (Dns)";
    };
    let reloaded = false;
    const onReload = () => (reloaded = true);
    window.addEventListener(WORKSPACE_RESYNCED_EVENT, onReload);
    await expect(resyncWorkspace(slide)).rejects.toBe("could not reach the workspace server (Dns)");
    window.removeEventListener(WORKSPACE_RESYNCED_EVENT, onReload);
    expect(reloaded).toBe(false);
  });

  test("says what changed in a few words", () => {
    expect(resyncSummary({ added: 0, updated: 0, unchanged: 4, removed: 0 })).toBe("Up to date");
    expect(resyncSummary({ added: 1, updated: 2, unchanged: 4, removed: 1 })).toBe("2 updated · 1 new · 1 removed");
    expect(resyncSummary({ added: 3, updated: 0, unchanged: 0, removed: 0 })).toBe("3 new");
  });
});
