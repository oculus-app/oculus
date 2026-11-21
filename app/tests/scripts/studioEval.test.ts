import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captionText, captionWords, paceStats, spokenScript, studioWords, voiceStats } from "../../scripts/studio-eval/narration";
import { inkOf, median, pictureStats } from "../../scripts/studio-eval/picture";
import { findAntigravitySessions, scanAntigravity } from "../../scripts/studio-eval/tokens/antigravity";
import { studioCommands } from "../../scripts/studio-eval/tokens/common";

test("still runs, holds, motion events and big changes come from the 5 fps series", () => {
  // 20 still steps (4 s), a move, 5 still (1 s), a cut, 2 moving steps.
  const series = [...Array(20).fill(0), 0.5, ...Array(5).fill(0.01), 9, 0.2, 0.2];
  const s = pictureStats(series, 60);
  expect(s.still).toBeCloseTo((100 * 25) / 29);
  expect(s.longest).toBeCloseTo(4);
  expect(s.hold3).toBeCloseTo((100 * 4) / 60);
  expect(s.events).toBe(2); // the move after the hold and the cut after the short run, per minute of 60 s
  expect(s.big).toBe(1);
  expect(s.mag).toBe(0.5); // upper middle of [0.2, 0.2, 0.5, 9]
});

test("ink is what differs from the commonest luma, boxed between the 2nd and 98th percentiles", () => {
  const w = 10;
  const h = 10;
  const frame = new Uint8Array(w * h).fill(200);
  for (let y = 2; y < 6; y++) for (let x = 3; x < 8; x++) frame[y * w + x] = 20;
  const ink = inkOf(frame, w, h);
  expect(ink.fill).toBeCloseTo(0.2);
  expect(ink.box).toBeCloseTo((5 * 4) / 100);
  expect(inkOf(new Uint8Array(w * h).fill(50), w, h)).toEqual({ fill: 0, box: 0 });
  expect(median([3, 1, 2, 10])).toBe(2.5);
});

test("word rates and long pauses", () => {
  const words = [0, 0.5, 1, 4, 4.5, 10];
  const p = paceStats(words, 30);
  expect(p.wpm).toBe(12);
  expect(p.pauses).toBe(4); // two gaps of 1.5 s or more in half a minute
  expect(p.pause_share).toBeCloseTo((100 * (3 + 5.5)) / 30);
  expect(paceStats([], 30).wpm).toBe(0);
});

test("json3 captions: timed segments, or words spread over an uploaded cue", () => {
  const json = {
    events: [
      { tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: "this video" }, { utf8: " is", tOffsetMs: 500 }] },
      { tStartMs: 4000, dDurationMs: 2000, segs: [{ utf8: "four words said [Music] here" }] },
    ],
  };
  expect(captionWords(json)).toEqual([1, 1.01, 1.5, 4, 4.4, 4.8, 5.2, 5.6]);
  expect(voiceStats(captionText(json)).spoken).toBe(7);
});

test("a Studio video's words are laid scene after scene", () => {
  const video = { scenes: [{ id: "a" }, { id: "quiet", hold: 2 }, { id: "b" }] };
  const manifest = { scenes: { a: { duration: 3, words: [{ start: 0.5 }, { start: 1 }] }, b: { duration: 2, words: [{ start: 0.25 }] } } };
  expect(studioWords(video, manifest)).toEqual([0.5, 1, 6.25]);
});

test("voice counts pointing words and persons per 100 words, from the script as said", () => {
  const text = spokenScript("## intro\n\nLook *here*: we see this. [pause 1] You'll see I'm right, and you know it.\n");
  const v = voiceStats(text);
  expect(v.spoken).toBe(13);
  expect(v.pointingBy).toEqual({ this: 1, here: 1, look: 1, watch: 0, see: 2 });
  expect(v.pointing).toBeCloseTo((100 * 5) / 13);
  expect(v.you).toBeCloseTo((100 * 2) / 13);
  expect(v.we).toBeCloseTo(100 / 13);
  expect(v.i).toBeCloseTo(100 / 13);
});

test("studio commands count runs, not prose that names them", () => {
  const c = studioCommands("oculus studio lint x && ~/bin/oculus studio render y\ncat <<EOF\nthen run `oculus studio narrate`\nEOF", {});
  expect(c).toEqual({ lint: 1, render: 1 });
  expect(studioCommands('tools.exec_command({cmd:"oculus studio strip v"})', {})).toEqual({ strip: 1 });
});

test("antigravity token reader handles native transcripts and Oculus ACP thread logs", () => {
  const transcript = [
    JSON.stringify({ step_index: 0, type: "USER_INPUT", created_at: "2026-11-21T03:00:00Z", content: "make a video" }),
    JSON.stringify({
      step_index: 1,
      type: "PLANNER_RESPONSE",
      created_at: "2026-11-21T03:00:05Z",
      model: "gemini-4-neon-high",
      input_tokens: 10000,
      cache_read_tokens: 0,
      output_tokens: 400,
      tool_calls: [
        { name: "run_command", args: { CommandLine: '"oculus studio series new demo --title \\"Demo\\""' } },
        { name: "run_command", args: { CommandLine: '"oculus studio narrate demo-1"' } },
      ],
    }),
    JSON.stringify({
      step_index: 2,
      type: "PLANNER_RESPONSE",
      created_at: "2026-11-21T03:00:20Z",
      model: "gemini-4-neon-high",
      input_tokens: 2000,
      cache_read_tokens: 10000,
      output_tokens: 300,
      tool_calls: [{ name: "read_file", args: { Path: '"/lib/studio/videos/demo-1/out/strip.png"' } }],
    }),
  ].join("\n");
  const t = scanAntigravity(transcript, "conv-1");
  expect(t.format).toBe("transcript");
  expect(t.usage["gemini-4-neon-high"]).toEqual({
    calls: 2, input: 12000, cachedRead: 10000, cachedWrite: 0, output: 700, thought: 0,
  });
  expect(t.context).toEqual([10000, 12000]);
  expect(t.images).toBe(1);
  expect(t.commands).toEqual({ series: 1, narrate: 1, READ_PNG: 1 });

  const late = scanAntigravity(transcript, "conv-1", "", {
    from: Date.parse("2026-11-21T03:00:10Z"),
    to: Date.parse("2026-11-21T03:01:00Z"),
  });
  expect(late.usage["gemini-4-neon-high"].calls).toBe(1);
  expect(late.usage["gemini-4-neon-high"].cachedRead).toBe(10000);
  expect(late.start).toBe("2026-11-21T03:00:20Z");
  expect(late.commands).toEqual({ READ_PNG: 1 });

  const acp = [
    JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { update: { sessionUpdate: "usage_update", used: 9724, size: 1048576 } } }),
    JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "tool_call", toolCallId: "c1", name: "run_command", rawInput: { CommandLine: "oculus studio render demo-1" } } },
    }),
    JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: { update: { sessionUpdate: "tool_call_update", toolCallId: "c1", name: "run_command", status: "completed", rawInput: { CommandLine: "oculus studio render demo-1" } } },
    }),
    JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      result: { stopReason: "end_turn", usage: { inputTokens: 18417, cachedReadTokens: 31375, cachedWriteTokens: 0, outputTokens: 459, thoughtTokens: 297, totalTokens: 50251 } },
    }),
  ].join("\n");
  const a = scanAntigravity(acp, "12");
  expect(a.format).toBe("acp");
  expect(a.usage.acp).toEqual({
    calls: 1, input: 18417, cachedRead: 31375, cachedWrite: 0, output: 459, thought: 297,
  });
  expect(a.context).toEqual([9724]);
  expect(a.contextWindow).toBe(1048576);
  expect(a.commands).toEqual({ render: 1 });
});

test("an Oculus ACP thread log is found behind its long initialize reply, and other providers' logs are not", () => {
  const data = mkdtempSync(join(tmpdir(), "studio-eval-"));
  const threads = join(data, "agents", "threads");
  mkdirSync(threads, { recursive: true });
  const initialize = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { agentInfo: { name: "agy" }, pad: "x".repeat(600) } });
  const call = JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { update: { sessionUpdate: "tool_call", toolCallId: "c1", name: "run_command", rawInput: { CommandLine: "oculus studio lint demo" } } },
  });
  const reply = JSON.stringify({ jsonrpc: "2.0", id: 4, result: { stopReason: "end_turn", usage: { inputTokens: 5, cachedReadTokens: 7, outputTokens: 2 } } });
  writeFileSync(join(threads, "7.ndjson"), [initialize, call, reply].join("\n") + "\n");
  writeFileSync(join(threads, "8.ndjson"), JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 9 } } }) + "\n");
  const env = process.env.ANTIGRAVITY_APP_DATA_DIR;
  process.env.ANTIGRAVITY_APP_DATA_DIR = join(data, "no-profile");
  try {
    const found = findAntigravitySessions(data, "2020-01-01T00:00:00Z");
    expect(found.map((s) => s.id)).toEqual(["7"]);
    expect(found[0].usage.acp).toEqual({ calls: 1, input: 5, cachedRead: 7, cachedWrite: 0, output: 2, thought: 0 });
    expect(found[0].commands).toEqual({ lint: 1 });
  } finally {
    if (env === undefined) delete process.env.ANTIGRAVITY_APP_DATA_DIR;
    else process.env.ANTIGRAVITY_APP_DATA_DIR = env;
  }
});
