import { describe, expect, test } from "bun:test";

import type { NarrateSummary } from "@/lib/studio/narration";
import { createNarrateStore } from "@/stores/studio/narrateStore";

const DIR = "/data/studio/videos/eigen";

/** A store whose narration resolves or rejects when the test says. */
function harness() {
  let finish: (value: NarrateSummary | null) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const calls = { narrate: [] as string[], cancel: [] as string[], reloads: 0 };
  const store = createNarrateStore({
    narrate: (slug) => {
      calls.narrate.push(slug);
      return new Promise((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    },
    cancel: async (slug) => {
      calls.cancel.push(slug);
      return true;
    },
    reload: () => {
      calls.reloads++;
    },
  });
  return { store, calls, finish: (v: NarrateSummary | null) => finish(v), fail: (e: Error) => fail(e) };
}

describe("narrateStore", () => {
  test("start holds the folder, events move the count, and the end settles once", async () => {
    const { store, calls, finish } = harness();
    const run = store.getState().start(DIR, "eigen");
    expect(store.getState().active[DIR]).toEqual({ slug: "eigen", n: 0, of: 0, done: 0 });
    // A second start for the same folder is ignored.
    void store.getState().start(DIR, "eigen");
    expect(calls.narrate).toEqual(["eigen"]);

    store.getState().apply({ dir: DIR, phase: "scene", id: "intro", n: 1, of: 4 });
    expect(store.getState().active[DIR]).toEqual({ slug: "eigen", n: 1, of: 4, done: 0 });
    store.getState().apply({ dir: DIR, phase: "done", id: "intro", n: 1, of: 4, outcome: "cached" });
    store.getState().apply({ dir: DIR, phase: "scene", id: "step", n: 2, of: 4 });
    expect(store.getState().active[DIR]).toEqual({ slug: "eigen", n: 2, of: 4, done: 1 });

    store.getState().apply({ dir: DIR, phase: "complete", scenes: 4, narrated: 3 });
    expect(store.getState().active[DIR]).toBeUndefined();
    expect(store.getState().settled[DIR]).toBe(1);
    expect(calls.reloads).toBe(1);

    // The command's answer after the event is the same end, not a second one.
    finish({ scenes: 4, narrated: 3, ms: 900 });
    await run;
    expect(store.getState().settled[DIR]).toBe(1);
    expect(calls.reloads).toBe(1);
    expect(store.getState().errors[DIR]).toBeUndefined();
  });

  test("a failure keeps its sentence until the next narration starts", async () => {
    const { store, fail } = harness();
    const run = store.getState().start(DIR, "eigen");
    fail(new Error("Kokoro's model is not downloaded."));
    await run;
    expect(store.getState().active[DIR]).toBeUndefined();
    expect(store.getState().errors[DIR]).toBe("Kokoro's model is not downloaded.");
    expect(store.getState().settled[DIR]).toBe(1);

    void store.getState().start(DIR, "eigen");
    expect(store.getState().errors[DIR]).toBeUndefined();
  });

  test("an error event settles with its sentence; a cancel settles without one", () => {
    const { store, calls } = harness();
    void store.getState().start(DIR, "eigen");
    store.getState().apply({ dir: DIR, phase: "error", error: "The TTS server did not answer." });
    expect(store.getState().errors[DIR]).toBe("The TTS server did not answer.");

    void store.getState().start(DIR, "eigen");
    store.getState().cancel(DIR, "eigen");
    expect(calls.cancel).toEqual(["eigen"]);
    store.getState().apply({ dir: DIR, phase: "cancelled" });
    expect(store.getState().active[DIR]).toBeUndefined();
    expect(store.getState().errors[DIR]).toBeUndefined();
    expect(store.getState().settled[DIR]).toBe(2);
  });

  test("an end for a folder with nothing running changes nothing", () => {
    const { store, calls } = harness();
    store.getState().apply({ dir: DIR, phase: "complete", scenes: 1, narrated: 1 });
    expect(store.getState().settled[DIR]).toBeUndefined();
    expect(calls.reloads).toBe(0);
  });

  test("progress for a narration it did not start still shows, named by its folder", () => {
    const { store } = harness();
    store.getState().apply({ dir: DIR, phase: "scene", id: "intro", n: 3, of: 5 });
    expect(store.getState().active[DIR]).toEqual({ slug: "eigen", n: 3, of: 5, done: 2 });
  });
});
