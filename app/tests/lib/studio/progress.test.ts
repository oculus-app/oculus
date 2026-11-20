import { describe, expect, test } from "bun:test";
import { buildRows } from "@/components/harness/timeline/rows";
import type { HarnessItem, HarnessRun } from "@/lib/harness";
import { lastStudioAction, studioAction } from "@/lib/studio/activity";
import { videoProgress } from "@/lib/studio/progress";
import type { SceneInfo, VideoDetail } from "@/lib/studio/videos";

let ids = 0;
const tool = (command: string, ok?: boolean, extra: Partial<HarnessItem> = {}): HarnessItem => ({
  id: ++ids,
  thread_id: 1,
  kind: "tool",
  ref_id: null,
  content: command,
  meta: JSON.stringify({ kind: "bash", input: { command }, ...(ok != null && { ok, output: ok ? "done" : "narration failed: no voice" }) }),
  created_at: "2026-11-20 10:00:00",
  ...extra,
});

const scene = (over: Partial<SceneInfo> = {}): SceneInfo => ({
  id: "a",
  component: "Card",
  title: null,
  built: true,
  start: null,
  duration: null,
  text: "Words.",
  ...over,
});

function detail(over: Partial<VideoDetail> = {}, narrated = false): VideoDetail {
  return {
    row: { slug: "v", dir: "/x/v", title: "V", subject: null, scenes: 0, narrated, renders: [], modified: 1, problem: null, threadId: 1 },
    fps: 30,
    width: 1920,
    height: 1080,
    theme: "default",
    voice: null,
    captions: false,
    timingProblem: null,
    scriptModified: 100,
    narrationModified: narrated ? 200 : null,
    scenes: [],
    renders: [],
    ...over,
  };
}

const render = (preset: "draft" | "final") => ({ preset, path: `/x/v/renders/${preset}.mp4`, modified: 300, captions: false });

describe("studioAction", () => {
  test("reads the action, the slug from a folder and the preset in every spelling", () => {
    expect(studioAction(tool("oculus studio render /data/studio/videos/bayes/ --final"))).toMatchObject({ action: "render", slug: "bayes", preset: "final" });
    expect(studioAction(tool("cd agents && oculus --json studio render --preset small bayes"))).toMatchObject({ slug: "bayes", preset: "small" });
    expect(studioAction(tool("zsh -lc 'OCULUS_AGENT=1 oculus studio narrate bayes --scene intro'"))).toMatchObject({ action: "narrate", slug: "bayes" });
    expect(studioAction(tool("oculus task list"))).toBeNull();
  });

  test("the latest call on the video is live only while it is the running tool", () => {
    const narrate = tool("oculus studio narrate v");
    expect(lastStudioAction([tool("oculus studio new v"), narrate], "v", true)).toMatchObject({ live: true, action: { action: "narrate" } });
    expect(lastStudioAction([narrate, tool("ls", true)], "v", true)?.live).toBe(false);
    expect(lastStudioAction([tool("oculus studio render other", true)], "v", false)).toBeNull();
  });
});

describe("videoProgress", () => {
  test("an empty folder waits for its script, and is writing it while the agent works", () => {
    expect(videoProgress({ detail: detail(), running: false })).toMatchObject({ label: "Not written yet", tone: "muted" });
    const busy = videoProgress({ detail: detail(), running: true });
    expect(busy).toMatchObject({ label: "Writing the script", tone: "busy" });
    expect(busy.steps[0].state).toBe("active");
  });

  test("scenes build with a count and a fraction for the bar", () => {
    const d = detail({ scenes: [scene(), scene({ built: false }), scene({ built: false }), scene()] });
    const p = videoProgress({ detail: d, running: true });
    expect(p.label).toBe("Building scenes · 2 of 4");
    expect(p.fraction).toBe(0.5);
    expect(p.steps.map((s) => s.state)).toEqual(["done", "active", "pending", "pending", "pending"]);
  });

  test("a live narrate call and a live render say so; a render with no fraction sweeps", () => {
    const d = detail({ scenes: [scene()] });
    const narrate = tool("oculus studio narrate v");
    expect(videoProgress({ detail: d, running: true, last: { action: studioAction(narrate)!, live: true } }).label).toBe("Narrating");
    const draft = tool("oculus studio render v");
    const p = videoProgress({ detail: d, running: true, last: { action: studioAction(draft)!, live: true } });
    expect(p).toMatchObject({ label: "Rendering draft", sweeping: true });
    const app = videoProgress({ detail: d, running: false, render: { slug: "v", preset: "final", fraction: 0.64, phase: "rendering" } });
    expect(app).toMatchObject({ label: "Rendering final · 64%", fraction: 0.64, sweeping: false });
    expect(app.steps[4].state).toBe("active");
  });

  test("a draft is ready, dated, and Final waits for the agent to ask", () => {
    const d = detail({ scenes: [scene({ start: 0, duration: 4 })], renders: [render("draft")] }, true);
    const p = videoProgress({ detail: d, running: false });
    expect(p).toMatchObject({ label: "Draft ready", tone: "ok" });
    expect(p.steps.map((s) => s.state)).toEqual(["done", "done", "done", "done", "pending"]);
    expect(p.steps[3].when).toBe(300);
    expect(p.steps[4].note).toBe("The agent asks before rendering it");
    expect(videoProgress({ detail: { ...d, renders: [render("draft"), render("final")] }, running: false }).label).toBe("Final ready");
  });

  test("a stale narration waits rather than failing", () => {
    const d = detail({ scenes: [scene()], timingProblem: "scene a: narration is for older text" }, true);
    const p = videoProgress({ detail: d, running: false });
    expect(p).toMatchObject({ label: "Narration out of date", tone: "muted" });
    expect(p.steps[2].state).toBe("pending");
  });

  test("a failed call shows once the agent stops, on its step, with its words", () => {
    const d = detail({ scenes: [scene()] });
    const failed = tool("oculus studio narrate v", false);
    const last = { action: studioAction(failed)!, live: false };
    expect(videoProgress({ detail: d, running: true, last }).tone).toBe("busy");
    const p = videoProgress({ detail: d, running: false, last });
    expect(p).toMatchObject({ label: "Narration failed", tone: "bad" });
    expect(p.steps[2]).toMatchObject({ state: "failed", note: "narration failed: no voice" });
    expect(videoProgress({ detail: null, running: false, error: "no such video" })).toMatchObject({ label: "Can't read the video", tone: "bad" });
  });
});

describe("render tiles", () => {
  test("the latest successful render per preset follows its run's fold", () => {
    const run: HarnessRun = { id: 5, status: "completed", delivery: "send", answer_item_id: null, started_ms: 0, ended_ms: 1000 };
    const at = { run_id: 5 };
    const items: HarnessItem[] = [
      { ...tool("q"), kind: "user", meta: null, ...at },
      tool("oculus studio render v", true, at),
      tool("oculus studio render v", true, at),
      tool("oculus studio render v --final", false, at),
      { ...tool("Done."), kind: "assistant", meta: null, display_role: "answer", ...at },
    ];
    const rows = buildRows(items, false, { runs: { 5: run } });
    expect(rows.map((r) => r.kind)).toEqual(["item", "work", "render", "item"]);
    const tile = rows[2];
    expect(tile.kind === "render" && tile.item.id).toBe(items[2].id);
  });
});
