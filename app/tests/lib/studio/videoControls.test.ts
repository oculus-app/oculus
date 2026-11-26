import { describe, expect, test } from "bun:test";

import type { NarrationStatus } from "@/lib/studio/narration";
import {
  narrateBlocker,
  narrateHint,
  narratingLabel,
  pillBlocker,
  renderNote,
  renderNoteWords,
} from "@/lib/studio/videoControls";

const status = (over: Partial<NarrationStatus> = {}): NarrationStatus => ({
  engine: "kokoro",
  voice: "af_heart",
  scenes: 12,
  stale: 0,
  problem: null,
  ...over,
});

const note = (over: Partial<Parameters<typeof renderNote>[0]> = {}) =>
  renderNote({ timingProblem: null, narration: status(), narrated: true, running: false, state: "current", ...over });

describe("the theme and voice pills", () => {
  test("are off while anything writes into the folder, and say why", () => {
    expect(pillBlocker({ rendering: false, narrating: false, running: false })).toBeNull();
    expect(pillBlocker({ rendering: true, narrating: false, running: false })).toBe("Wait for the render or cancel it");
    expect(pillBlocker({ rendering: false, narrating: true, running: false })).toBe(
      "Wait for the narration or cancel it",
    );
    expect(pillBlocker({ rendering: false, narrating: false, running: true })).toBe(
      "The chat is still working on this video",
    );
  });
});

describe("the note beside the render on screen", () => {
  test("is plain, out of date, or about the narration", () => {
    expect(note()).toBe("plain");
    expect(note({ state: null, narration: null })).toBe("plain");
    expect(note({ state: "stale" })).toBe("stale");
    // A render needs the narration first, whatever the file's state.
    expect(note({ timingProblem: "Scene 3 has no narration clip.", state: "stale" })).toBe("narration");
  });

  test("clips in another voice, or behind the script, make the narration out of date", () => {
    expect(note({ narration: status({ stale: 12 }), state: "stale" })).toBe("narration");
    expect(note({ narration: status({ stale: 1 }) })).toBe("narration");
  });

  test("a video never narrated says so once its thread is idle", () => {
    expect(note({ narrated: false, narration: status({ stale: 12 }) })).toBe("unnarrated");
    expect(note({ narrated: false, narration: status({ stale: 12 }), running: true })).toBe("plain");
    expect(note({ narrated: false, narration: status({ scenes: 0 }) })).toBe("plain");
  });

  test("Narrate says how many scenes, and names a server", () => {
    expect(narrateHint(status({ stale: 5 }))).toBe("Narrates 5 scenes");
    expect(narrateHint(status({ stale: 1 }))).toBe("Narrates 1 scene");
    expect(narrateHint(status({ engine: "server", stale: 5 }))).toBe("Sends 5 scenes to your TTS server");
    expect(narrateHint(status())).toBeNull();
    expect(narrateHint(null)).toBeNull();
  });

  test("words", () => {
    expect(renderNoteWords({ note: "plain", preset: "Draft", ago: "6h ago" })).toEqual({ made: "Draft · 6h ago", flag: null });
    expect(renderNoteWords({ note: "plain", preset: null, ago: "6h ago" })).toEqual({ made: "6h ago", flag: null });
    expect(renderNoteWords({ note: "stale", preset: "Draft", ago: "6h ago" })).toEqual({
      made: "Draft · 6h ago",
      flag: "Out of date",
    });
    expect(renderNoteWords({ note: "stale", preset: null, ago: "6h ago" })).toEqual({ made: "6h ago", flag: "Out of date" });
    expect(renderNoteWords({ note: "narration", preset: "Draft", ago: "6h ago" })).toEqual({
      made: null,
      flag: "Narration out of date",
    });
    expect(renderNoteWords({ note: "unnarrated", preset: null, ago: null })).toEqual({ made: null, flag: "Not narrated" });
  });

  test("Narrate is off while a render or the turn runs, or narration cannot run now", () => {
    expect(narrateBlocker({ rendering: false, running: false, problem: null })).toBeNull();
    expect(narrateBlocker({ rendering: true, running: false, problem: null })).toBe("Wait for the render or cancel it");
    expect(narrateBlocker({ rendering: false, running: true, problem: null })).toBe(
      "The chat is still working on this video",
    );
    expect(narrateBlocker({ rendering: false, running: false, problem: "Choose a narration voice." })).toBe(
      "Choose a narration voice.",
    );
  });

  test("the narration bar names the scene once it is known", () => {
    expect(narratingLabel({ n: 0, of: 0 })).toBe("Narrating…");
    expect(narratingLabel({ n: 4, of: 12 })).toBe("Narrating 4/12");
  });
});
