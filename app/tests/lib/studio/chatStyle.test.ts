import { expect, test } from "bun:test";
import { studioStyleContext } from "../../../src/lib/studio/chatStyle";

test("video choices carry style without demanding a folder for questions", () => {
  const context = studioStyleContext({ theme: "chalk", format: "reels", lengthSecs: 90 });
  expect(context).toContain("theme chalk, portrait, about 90 s");
  expect(context).toContain("--theme 'chalk' --portrait");
  expect(context).toContain("A question about Studio or themes alone does not ask for a video");
});

test("Auto follows the subject theme without inventing a length or theme flag", () => {
  const context = studioStyleContext({ theme: null, format: "video", lengthSecs: null });
  expect(context).toContain("subject's default theme, landscape, length Auto");
  expect(context).not.toContain("--theme");
  expect(context).not.toContain("--portrait");
});
