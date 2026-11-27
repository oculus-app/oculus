import { describe, expect, test } from "bun:test";

import type { ChatSaveRow } from "@/lib/db";
import { fullCitation } from "@/lib/citations";
import { resolveSaveStates, showSave, useChatSaves, type SaveLookups } from "@/stores/chat/chatSaveStore";

const SVG = ".oculus/agents/outputs/dfa-even-zeros.svg";
const PY = ".oculus/agents/outputs/dfa_check.py";
const TASTE = ".oculus/agents/TASTE.md";
const REUSED = ".oculus/agents/outputs/plot.png";

const stamp = (size: number, modifiedMs: number) => ({ size, modifiedMs });

const row = (source: string, size: number, mtime: number, rel: string): ChatSaveRow => ({
  source,
  file_id: 7,
  source_size: size,
  source_mtime: mtime,
  relative_path: rel,
  subject_id: 3,
});

describe("resolveSaveStates", () => {
  const calls: { savable: string[][]; saves: string[][] } = { savable: [], saves: [] };
  const lookups: SaveLookups = {
    // Rust refuses the agent's own files: TASTE.md has no stamp.
    savable: async (paths) => {
      calls.savable.push(paths);
      return paths.map((p) => (p === TASTE ? null : p === REUSED ? stamp(20, 2000) : stamp(10, 1000)));
    },
    saves: async (paths) => {
      calls.saves.push(paths);
      return [
        row(SVG, 10, 1000, "courses/COMP30026/Diagrams/dfa-even-zeros.svg"),
        // Saved before the agent wrote a new picture under the same name.
        row(REUSED, 20, 1500, "Plots/plot.png"),
      ];
    },
  };

  test("one call to Rust and one query for every path, the refused ones not asked about", async () => {
    const states = await resolveSaveStates([SVG, PY, TASTE, REUSED], lookups);
    expect(calls.savable).toEqual([[SVG, PY, TASTE, REUSED]]);
    expect(calls.saves).toEqual([[SVG, PY, REUSED]]);
    expect(states[TASTE]).toBeNull();
    expect(states[PY]).toEqual({ stamp: stamp(10, 1000), saved: null });
    expect(states[SVG]).toEqual({
      stamp: stamp(10, 1000),
      saved: { fileId: 7, relativePath: "courses/COMP30026/Diagrams/dfa-even-zeros.svg" },
    });
  });

  test("a save stands for the file only while its stamp still matches", async () => {
    const states = await resolveSaveStates([REUSED], lookups);
    expect(states[REUSED]).toEqual({ stamp: stamp(20, 2000), saved: null });
  });
});

describe("an old chat's spelling", () => {
  test("names the same workspace path the control asks about", () => {
    for (const raw of [
      "agents/outputs/dfa-even-zeros.svg",
      "outputs/dfa-even-zeros.svg",
      "./outputs/dfa-even-zeros.svg",
      ".oculus/agents/outputs/dfa-even-zeros.svg",
      "/Users/student/Library/Application Support/com.tchan.oculus/agents/outputs/dfa-even-zeros.svg",
      "/Users/student/Library/Application Support/com.tchan.oculus/.oculus/agents/outputs/dfa-even-zeros.svg",
    ]) {
      expect(fullCitation(raw)?.path).toBe(SVG);
    }
  });
});

describe("refresh", () => {
  test("asks again only about the paths a mounted row shows, and forgets the rest", () => {
    const old = { stamp: stamp(10, 1000), saved: null };
    useChatSaves.setState({ states: { [SVG]: old, [PY]: old, [REUSED]: old } });
    const hideSvg = showSave(SVG);
    const hideAgain = showSave(SVG);
    const hidePy = showSave(PY);
    hidePy();
    useChatSaves.getState().refresh();
    expect(Object.keys(useChatSaves.getState().states)).toEqual([SVG]);
    hideSvg();
    useChatSaves.getState().refresh();
    expect(Object.keys(useChatSaves.getState().states)).toEqual([SVG]);
    hideAgain();
    useChatSaves.getState().refresh();
    expect(useChatSaves.getState().states).toEqual({});
  });
});
