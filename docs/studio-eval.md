# Measuring Studio videos

`app/scripts/studio-eval/` measures a Studio video beside reference videos:
how its picture moves, how much of the frame it uses, how fast and in what
voice it is narrated, and the tokens the agents spent making it. It is a dev
tool run with bun, not part of the app.

## Where

| Piece | Location |
| --- | --- |
| Commands and output | `app/scripts/studio-eval/index.ts` |
| Picture numbers (motion series, stillness, ink) | `app/scripts/studio-eval/picture.ts` |
| Narration numbers (word times, pace, voice) | `app/scripts/studio-eval/narration.ts` |
| Contact sheet | `app/scripts/studio-eval/sheet.ts` |
| Finding ffmpeg, probing, raw frames | `app/scripts/studio-eval/ffmpeg.ts` |
| The data folder and the CLIs' session folders | `app/scripts/studio-eval/paths.ts` |
| Claude Code and Codex token use | `app/scripts/studio-eval/tokens/` |
| Tests of the pure maths | `app/tests/scripts/studioEval.test.ts` |

## Commands

Run from `app/`:

```sh
bun scripts/studio-eval video <mp4> [--slug <studio slug> | --captions <file.json3>] [--json]
bun scripts/studio-eval motion <mp4> [out.txt]
bun scripts/studio-eval sheet <mp4> <out.jpg> [--start 0] [--step 10] [--cols 4] [--rows 4]
bun scripts/studio-eval tokens claude [<session.jsonl> ...] [--since <iso> [--until <iso>] [--cwd <dir>] [--all]]
bun scripts/studio-eval tokens codex [<rollout.jsonl[.zst]> ...] [--since <iso> [--until <iso>] [--cwd <dir>] [--all]] [--context]
```

`--data <dir>` names the app's data folder (default: where the app keeps it,
`~/Library/Application Support/com.tchan.oculus` on macOS, as
`keyd_core::paths::data_dir`); `--ffmpeg <path>` names ffmpeg. The scripts
only read the data folder.

## ffmpeg

`--ffmpeg` wins, else the copy `bun run ffmpeg` fetched into
`app/src-tauri/binaries/`, else `ffmpeg` on PATH. Only `fps`, `crop`, `scale`
and `format` are used, all in the app's own build: frames come out as raw
bytes and the differences, ink and tiling are computed in TypeScript. The
duration comes from ffprobe when one sits beside ffmpeg or on PATH, and
otherwise from ffmpeg's banner, which gives it to 10 ms.

## `video`: one row of numbers

The bottom fifth of every frame is cropped first, since reference videos
burn captions in there.

- **Motion series.** The frame at 5 fps, 320x144 grey; each value is the
  mean absolute luma difference from the previous frame (0–255), rounded to
  six significant digits. `motion` prints the series; `video --save-motion`
  writes it and `--motion <txt>` reuses one.
- **still %**: steps whose change is under 0.03.
- **holds ≥3 s %**: share of the running time inside still runs of 3 s or
  more; **longest hold** is the longest still run.
- **motion events / min**: a moving step after at least three still ones,
  so something starting to move after a pause.
- **big changes / min**: steps crossing a change of 8: a cut or a
  whole-frame swap.
- **median change**: the upper median of the steps that move.
- **ink %** and **bounding box %**: 40 frames spread evenly (`--samples`),
  at 160x72 grey. The background is the commonest luma, binned by 8; a pixel
  more than 28 from it is ink. Ink % is the share of ink pixels, and the box
  holds the 2nd to 98th percentile of ink on each axis. Both are medians
  over the samples; under 8 ink pixels a frame counts as empty.
- **Word times.** For a reference, from YouTube json3 captions (`--captions`,
  else the `.en.json3` beside the mp4): auto captions time each segment, and
  an uploaded track's words are spread evenly over their cue. For a Studio
  video (`--slug`), from `videos/<slug>/narration/manifest.json` with the
  scenes of `video.json` laid end to end: a narrated scene lasts its clip
  plus 1 s and a silent one its `hold` (3 s without one). That ignores the
  theme's lead and transitions, so a word's place in the video is good to
  about a second; counts and gaps inside a scene are exact.
- **wpm** is words over the running time; **pauses / min** counts gaps of
  1.5 s or more between words, and their share of the running time.
- **Voice**, per 100 words: **pointing** words (`this`, `here`, `look`,
  `watch`, `see`, each counted too) and the persons **you**, **we** and
  **I**, where a contraction (you're, we'll, I'm) counts as its pronoun.
  The text is the caption track's, with `[Music]`-style notes removed, or
  the Studio video's `script.md` as said: `## <id>` headings, pause markers
  and `*`, `_` and backticks dropped (see
  [studio.md](./studio.md#narration-sets-a-scenes-length-and-cues-its-elements)).

`--json` prints the row with the same field names: `dur`, `still`,
`longest`, `hold3`, `events`, `mag`, `big`, `words`, `wpm`, `pauses`,
`pause_share`, `fill`, `box`, `spoken`, `pointing`, `pointingBy`, `you`,
`we`, `i`.

## `sheet`

One frame every `--step` seconds from `--start`, 300 px wide with the
height keeping the aspect (rounded to even), laid row by row in `--cols` by
`--rows` with 3 px grey gaps, and written as a JPEG. Missing tiles stay grey.

## `tokens`

Both take session files or `--since` (and `--until`), which finds the
sessions a CLI ran from `--cwd`. `--cwd` defaults to the data folder's
`agents/`, where chat threads run. Without `--all`, only sessions that ran
an `oculus studio` command are listed. A command counts where it can run: at
a line's start, after a shell operator or an opening quote, optionally
behind a path. A name in prose, such as one in backticks in a heredoc, is
not counted.

- **`claude`** reads `~/.claude/projects/<cwd>/<session>.jsonl`
  (`CLAUDE_CONFIG_DIR` moves `~/.claude`); the folder is the cwd with every
  character other than a letter or digit made `-`. Each session's subagent
  transcripts are `<session>/subagents/*.jsonl`. Per model, main and
  subagents apart: calls, input, output, cache write and cache read
  tokens. A message is counted once though Claude Code writes a line per
  content block. Also the `oculus studio` commands, PNGs read
  (`READ_PNG`) and the subagent types started.
- **`codex`** reads `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, or
  `.jsonl.zst` (`CODEX_HOME` moves `~/.codex`). A thread is a root rollout
  plus the rollouts whose `session_meta.parent_thread_id` names it. Per
  rollout: model and effort, calls (token counts carrying a total), input,
  cached input and output tokens from the last total, images viewed, the
  primary rate-limit window's used % at the first and last report (the 5-hour
  window), and the `oculus studio` commands. Explicit files print as one
  group.
- **`codex --context`** shows what fills a rollout's context: the input size
  of each call (first, median, last, peak) and the characters of tool calls
  (`IN`) and their output (`OUT`) by kind: `studio <command>`,
  `apply_patch`, `view_image`, `read <file kind>` or `other shell`. Output
  arrays are measured as compact JSON with inline images replaced.
