import type { StudioSeries } from "./videos";

/** The unsent draft Make this part opens a new chat with. It names both slugs
 *  because the chat's first turn has no brief, and its leading
 *  `/oculus-studio ` becomes the skill chip. */
export function seriesPartRequest(series: StudioSeries, partNumber: number): { draft: string } {
  const part = series.parts.find((p) => p.number === partNumber);
  if (!part) throw new Error("This part is not in the series outline.");
  if (part.made) throw new Error("This part already has a render.");
  return { draft: `/oculus-studio Make part ${partNumber} of the series \`${series.slug}\` (video \`${part.slug}\`).` };
}
