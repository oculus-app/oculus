import { expect, test } from "bun:test";
import { createVideosStore } from "@/stores/studio/videosStore";
import type { VideoList } from "@/lib/studio/videos";
import { series, video } from "./seriesFixtures";

test("one read publishes videos and outlines atomically, and the newest read wins", async () => {
  const reads: ((value: VideoList) => void)[] = [];
  const store = createVideosStore(() => new Promise((resolve) => reads.push(resolve)));
  const first = store.getState().reload();
  const second = store.getState().reload();
  const newest = { videos: [video("new")], series: [series()] };
  reads[1](newest); await second;
  expect(store.getState()).toMatchObject({ ...newest, loaded: true, error: null });
  reads[0]({ videos: [], series: [] }); await first;
  expect(store.getState()).toMatchObject(newest);
});

test("a failed read keeps the last complete pair and reports its error", async () => {
  let fail = false;
  const list = { videos: [video("a")], series: [series()] };
  const store = createVideosStore(async () => {
    if (fail) throw new Error("Cannot read videos");
    return list;
  });
  await store.getState().reload(); fail = true;
  await store.getState().reload();
  expect(store.getState()).toMatchObject({ ...list, loaded: true, error: "Cannot read videos" });
});
