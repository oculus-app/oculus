import type { StudioStyle } from "@/components/studio/style/style";

/** Style is prompt context, never appended to the student's stored words. */
export function studioStyleContext(style: StudioStyle): string {
  const theme = style.theme ? `theme ${style.theme}, ` : "the subject's default theme, ";
  const shape = style.format === "reels" ? "portrait" : "landscape";
  const length = style.lengthSecs == null ? "length Auto" : `about ${style.lengthSecs} s`;
  const flags = [style.theme ? `--theme '${style.theme.replace(/'/g, "'\\''")}'` : "", style.format === "reels" ? "--portrait" : ""].filter(Boolean).join(" ");
  return `Video style: ${theme}${shape}, ${length}. If this request is for a video and the thread has no video being made, run oculus studio new <slug>${flags ? ` ${flags}` : ""}. A question about Studio or themes alone does not ask for a video.`;
}
