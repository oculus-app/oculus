import { describe, expect, test } from "bun:test";

import type { NarrationStatus } from "@/lib/studio/narration";
import {
  initialVoiceChoice,
  narrateAction,
  narrateBlocker,
  narratingLabel,
  pillBlocker,
  renderNote,
  renderNoteText,
} from "@/lib/studio/videoControls";

const status = (over: Partial<NarrationStatus> = {}): NarrationStatus => ({
  engine: "kokoro",
  voice: "af_heart",
  scenes: 12,
  stale: 0,
  problem: null,
  ...over,
});

const NAMES: Record<string, string> = { af_heart: "Heart", am_michael: "Michael" };
const name = (id: string) => NAMES[id] ?? id;

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

describe("the voice popover", () => {
  test("opens on Default when the video narrates with the Settings voice, else on its own", () => {
    expect(initialVoiceChoice(status(), "af_heart")).toBeNull();
    expect(initialVoiceChoice(status({ voice: "am_michael" }), "af_heart")).toBe("am_michael");
    expect(initialVoiceChoice(status({ voice: null }), "af_heart")).toBeNull();
  });

  test("a different voice is set and every scene narrated", () => {
    expect(narrateAction({ choice: "am_michael", settingsVoice: "af_heart", status: status(), name })).toEqual({
      kind: "use",
      voice: "am_michael",
      narrate: true,
      label: "Use Michael · narrate 12 scenes",
    });
    // Back to the Settings voice sends null, so the video follows Settings.
    expect(
      narrateAction({ choice: null, settingsVoice: "af_heart", status: status({ voice: "am_michael" }), name }),
    ).toEqual({ kind: "use", voice: null, narrate: true, label: "Use Heart · narrate 12 scenes" });
    // A server's voice id reads as typed.
    const server = status({ engine: "server", scenes: 1 });
    expect(narrateAction({ choice: "bf_emma", settingsVoice: "af_heart", status: server, name })).toMatchObject({
      kind: "use",
      label: "Use bf_emma · narrate 1 scene",
    });
  });

  test("the same voice narrates only what is stale, or says the narration is current", () => {
    expect(narrateAction({ choice: null, settingsVoice: "af_heart", status: status({ stale: 3 }), name })).toEqual({
      kind: "narrate",
      label: "Narrate 3 scenes",
    });
    expect(narrateAction({ choice: null, settingsVoice: "af_heart", status: status({ stale: 1 }), name })).toEqual({
      kind: "narrate",
      label: "Narrate 1 scene",
    });
    expect(narrateAction({ choice: null, settingsVoice: "af_heart", status: status(), name })).toEqual({
      kind: "current",
    });
    // Picking the Settings voice's own row when the video follows Settings is no change.
    expect(narrateAction({ choice: "af_heart", settingsVoice: "af_heart", status: status(), name }).kind).toBe(
      "current",
    );
  });

  test("a voice change on a script with nothing to narrate only sets the voice", () => {
    expect(
      narrateAction({ choice: "am_michael", settingsVoice: "af_heart", status: status({ scenes: 0 }), name }),
    ).toEqual({ kind: "use", voice: "am_michael", narrate: false, label: "Use Michael" });
  });
});

describe("the note beside the render on screen", () => {
  test("is plain, out of date, or about the narration", () => {
    expect(renderNote({ timingProblem: null, state: "current" })).toBe("plain");
    expect(renderNote({ timingProblem: null, state: null })).toBe("plain");
    expect(renderNote({ timingProblem: null, state: "stale" })).toBe("stale");
    // A render needs the narration first, whatever the file's state.
    expect(renderNote({ timingProblem: "Scene 3 has no narration clip.", state: "stale" })).toBe("narration");
  });

  test("words", () => {
    expect(renderNoteText({ note: "plain", preset: "Draft", ago: "6h ago" })).toBe("Draft · 6h ago");
    expect(renderNoteText({ note: "plain", preset: null, ago: "6h ago" })).toBe("6h ago");
    expect(renderNoteText({ note: "stale", preset: "Draft", ago: "6h ago" })).toBe("Draft · 6h ago · out of date");
    expect(renderNoteText({ note: "stale", preset: null, ago: "6h ago" })).toBe("6h ago · out of date");
    expect(renderNoteText({ note: "narration", preset: "Draft", ago: "6h ago" })).toBe("Narration out of date");
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
