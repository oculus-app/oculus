import { describe, expect, test } from "bun:test";

import { videoPageView } from "@/lib/studio/seriesView";
import { afterVideoDelete, deleteVideoBlocker, deleteVideoPrompt, trashName } from "@/lib/studio/videoActions";
import type { VideoDetail } from "@/lib/studio/videos";
import { part, series } from "./seriesFixtures";

describe("Delete video…", () => {
  test("is off while a render, a narration or the thread's turn runs, and says why", () => {
    const idle = { rendering: false, narrating: false, running: false };
    expect(deleteVideoBlocker(idle)).toBeNull();
    expect(deleteVideoBlocker({ ...idle, rendering: true })).toBe("Cancel the render first");
    expect(deleteVideoBlocker({ ...idle, narrating: true })).toBe("Wait for the narration or cancel it");
    expect(deleteVideoBlocker({ ...idle, running: true })).toBe("The chat is still working on this video");
    // What the student can stop from the page comes first.
    expect(deleteVideoBlocker({ rendering: true, narrating: false, running: true })).toBe("Cancel the render first");
    expect(deleteVideoBlocker({ rendering: false, narrating: true, running: true })).toBe(
      "Wait for the narration or cancel it",
    );
  });

  test("names the Trash, or the Recycle Bin on Windows", () => {
    expect(trashName(false)).toBe("Trash");
    expect(trashName(true)).toBe("Recycle Bin");
    const mac = deleteVideoPrompt({ title: "Eigenvalues", part: null, windows: false });
    expect(mac).toEqual({
      title: "Delete “Eigenvalues”?",
      description: "Its script, narration and renders move to the Trash.",
      confirmLabel: "Move to Trash",
      busyLabel: "Moving to Trash",
    });
    const win = deleteVideoPrompt({ title: "Eigenvalues", part: null, windows: true });
    expect(win.description).toBe("Its script, narration and renders move to the Recycle Bin.");
    expect(win.confirmLabel).toBe("Move to Recycle Bin");
  });

  test("a series' part says it goes back to not made", () => {
    expect(deleteVideoPrompt({ title: "Bases", part: 3, windows: false }).description).toBe(
      "Its script, narration and renders move to the Trash. Part 3 goes back to not made.",
    );
  });
});

describe("after a delete", () => {
  test("a part stays, a video beside its chat closes, any other leaves for the grid", () => {
    expect(afterVideoDelete({ part: true, inSide: false })).toBe("stay");
    expect(afterVideoDelete({ part: true, inSide: true })).toBe("stay");
    expect(afterVideoDelete({ part: false, inSide: true })).toBe("close-side");
    expect(afterVideoDelete({ part: false, inSide: false })).toBe("videos");
  });

  test("a deleted part's page is its not-made view, never the failed read's error", () => {
    // The detail read last fails once the folder is gone; the list decides first.
    const gone = { series: series({ parts: [part(1), part(2), part(3)] }), part: part(3) };
    const stale = {} as VideoDetail;
    expect(videoPageView({ loaded: true, membership: gone, detail: stale, error: "No such video" })).toBe("unmade");
    expect(videoPageView({ loaded: true, membership: gone, detail: null, error: "No such video" })).toBe("unmade");
  });
});
