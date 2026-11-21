import { describe, expect, test } from "bun:test";
import { seriesPartRequest, seriesSendMode, seriesSendSelection } from "@/lib/studio/seriesRequest";
import type { HarnessThread } from "@/lib/harness/types";
import { PROVIDER_IDS, type Provider } from "@/lib/harness/providers";
import type { SteerInputs } from "@/lib/harness/sendMode";
import { createSeriesMakeStore } from "@/stores/studio/seriesMakeState";
import { part, series } from "./seriesFixtures";

const thread = (provider: Provider): HarnessThread => ({
  id: 7, provider, provider_session_id: null, model: "chosen-model", effort: "high", subject_id: null,
  lecture_id: null, title: null, status: "idle", usage: null, created_at: "", updated_at: "",
});

describe("Make this part", () => {
  test("every provider uses the thread's explicit selection; a held composer pick wins", () => {
    for (const provider of PROVIDER_IDS) {
      expect(seriesSendSelection(thread(provider))).toEqual({ provider, model: "chosen-model", effort: "high" });
    }
    expect(seriesSendSelection(thread("claude"), { provider: "codex", model: "picked", effort: "low" }))
      .toEqual({ provider: "codex", model: "picked", effort: "low" });
    for (const missing of [{ model: null }, { effort: null }, { effort: undefined }, { model: " " }]) {
      expect(() => seriesSendSelection({ ...thread("codex"), ...missing })).toThrow("Choose a model and reasoning level");
    }
    expect(() => seriesSendSelection(thread("codex"), { provider: "claude", model: null, effort: "high" })).toThrow();
  });
  test("the existing thread gets ordinary text; a new chat gets an unsent skill draft naming both slugs", () => {
    const outline = series({ parts: [part(2)] });
    expect(seriesPartRequest(outline, 2)).toEqual({ text: "Make part 2", draft: "/oculus-studio Make part 2 of the series `motion` (video `part-2`)." });
    expect(() => seriesPartRequest(outline, 0)).toThrow("not in the series");
    expect(() => seriesPartRequest(series({ parts: [part(1, { made: true })] }), 1)).toThrow("already has a render");
  });
  test("Enter shares the composer's steering, restart, queue and waiting-question decisions", () => {
    const input: SteerInputs = { running: true, liveRun: { stopping: false }, caps: { activeSteering: true, steerByRestart: false }, questionWaits: false };
    expect(seriesSendMode(input, "steer")).toBe("steer");
    expect(seriesSendMode(input, "queue")).toBe("queue");
    expect(seriesSendMode({ ...input, running: false }, "queue")).toBeUndefined();
    expect(seriesSendMode({ ...input, caps: { activeSteering: false, steerByRestart: true } }, "steer")).toBe("steer");
    expect(seriesSendMode({ ...input, caps: { activeSteering: false, steerByRestart: false } }, "steer")).toBe("queue");
    expect(seriesSendMode({ ...input, questionWaits: true }, "steer")).toBe("queue");
    expect(seriesSendMode({ ...input, liveRun: null }, "steer")).toBe("queue");
    expect(seriesSendMode({ ...input, liveRun: { stopping: true } }, "steer")).toBe("queue");
  });
});

const deferred = () => {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const openDraft = async () => {};
function setup(initialRunning = false) {
  const done = deferred();
  let running = initialRunning;
  let sends = 0;
  const outline = series({ threadId: 7, parts: [part(1)] });
  const store = createSeriesMakeStore({
    running: () => running,
    send: async (_s, _n, dispatching) => { sends++; dispatching(); await done.promise; },
  });
  return { store, done, outline, sends: () => sends, running: (next: boolean) => { running = next; store.getState().observe([outline]); } };
}

describe("shared series request lifetime", () => {
  test("a request is visible immediately, deduplicated across callers, and survives until its turn ends", async () => {
    const t = setup();
    const pending = t.store.getState().make(t.outline, 1, openDraft);
    expect(t.store.getState().requests.motion).toMatchObject({ requestedPart: 1, sending: true, error: null });
    expect(await t.store.getState().make(t.outline, 1, openDraft)).toBe(false);
    expect(t.sends()).toBe(1);
    t.done.resolve(); await pending;
    expect(t.store.getState().requests.motion.requestedPart).toBe(1);
    t.running(true); t.running(false);
    expect(t.store.getState().requests.motion.requestedPart).toBeNull();
  });
  test("a render clears the requested part while the agent still runs", async () => {
    const t = setup(true);
    const pending = t.store.getState().make(t.outline, 1, openDraft);
    t.done.resolve(); await pending;
    t.store.getState().observe([{ ...t.outline, parts: [part(1, { made: true })] }]);
    expect(t.store.getState().requests.motion.requestedPart).toBeNull();
  });
  test("a fast turn ends before send resolves without leaving a stuck request", async () => {
    const t = setup();
    const pending = t.store.getState().make(t.outline, 1, openDraft);
    t.store.getState().observe([t.outline], new Set([7]));
    t.done.resolve(); await pending;
    expect(t.store.getState().requests.motion).toMatchObject({ requestedPart: null, sending: false });
  });
  test("an earlier turn ending during preparation does not end the new request", async () => {
    const ready = deferred();
    const done = deferred();
    const outline = series({ threadId: 7, parts: [part(1)] });
    const store = createSeriesMakeStore({
      running: () => false,
      send: async (_s, _n, dispatching) => { await ready.promise; dispatching(); await done.promise; },
    });
    const pending = store.getState().make(outline, 1, openDraft);
    store.getState().observe([outline], new Set([7]));
    ready.resolve(); await ready.promise;
    done.resolve(); await pending;
    expect(store.getState().requests.motion.requestedPart).toBe(1);
    store.getState().observe([outline], new Set([7]));
    expect(store.getState().requests.motion.requestedPart).toBeNull();
  });
  test("a queued continuation stays pending while the harness keeps the thread running", async () => {
    const t = setup(true);
    const pending = t.store.getState().make(t.outline, 1, openDraft);
    t.done.resolve(); await pending;
    t.store.getState().observe([t.outline], new Set([7]));
    expect(t.store.getState().requests.motion.requestedPart).toBe(1);
    t.running(false);
    expect(t.store.getState().requests.motion.requestedPart).toBeNull();
  });
  test("a send failure is shared and releases the request for retry", async () => {
    const t = setup();
    const pending = t.store.getState().make(t.outline, 1, openDraft);
    t.done.reject(new Error("Cannot send"));
    expect(await pending).toBe(false);
    expect(t.store.getState().requests.motion).toMatchObject({ error: "Cannot send", sending: false, requestedPart: null });
  });
  test("opening an unsent draft leaves no pending turn", async () => {
    let draft: [string | null, string] | null = null;
    const store = createSeriesMakeStore({ running: () => false, send: async (s, n, _dispatch, open) => open(s.subject, seriesPartRequest(s, n).draft) });
    expect(await store.getState().make(series({ parts: [part(1)] }), 1, async (subject, text) => { draft = [subject, text]; })).toBe(true);
    expect(draft).toEqual(["PHYS", "/oculus-studio Make part 1 of the series `motion` (video `part-1`)."]);
    expect(store.getState().requests.motion.requestedPart).toBeNull();
  });
});
