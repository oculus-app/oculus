import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { VideoFacts } from "@/components/studio/video/VideoFacts";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { VideoDetail } from "@/lib/studio/videos";
import { video } from "../../lib/studio/seriesFixtures";

const detail = (extra: Partial<VideoDetail> = {}): VideoDetail => ({
  row: video("eigen"),
  fps: 30,
  width: 1920,
  height: 1080,
  theme: "chalk",
  voice: "af_heart",
  captions: false,
  timingProblem: null,
  scriptModified: null,
  narrationModified: null,
  scenes: [],
  renders: [],
  ...extra,
});

const html = (d: VideoDetail, running: boolean) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>
        <VideoFacts detail={d} narration={{ status: null, error: null, reload: () => {} }} running={running} onChanged={() => {}} />
      </TooltipProvider>
    </MemoryRouter>,
  );

test("the theme and voice are pickers, off while the thread's turn runs", () => {
  const idle = html(detail(), false);
  expect(idle).toContain('aria-label="Theme: chalk"');
  expect(idle).toContain('aria-label="Narration voice: af_heart"');
  expect(idle).not.toContain('aria-disabled="true"');

  const busy = html(detail(), true);
  expect(busy.match(/aria-disabled="true"/g)?.length).toBe(2);
});

test("a video with no voice still offers the picker", () => {
  expect(html(detail({ voice: null }), false)).toContain('aria-label="Narration voice: No voice"');
});

test("a theme named by path shows as written", () => {
  expect(html(detail({ theme: "themes/mine.json" }), false)).toContain(">themes/mine.json<");
});
