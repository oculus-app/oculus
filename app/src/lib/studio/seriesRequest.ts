import { deliveryMode, sendAction, steerKind, type FollowUp, type SteerInputs } from "@/lib/harness/sendMode";
import { threadSelection } from "@/lib/harness/switching";
import type { Selection } from "@/lib/harness/switching";
import type { HarnessThread } from "@/lib/harness/types";
import type { StudioSeries } from "./videos";

/** The thread's composer pick, with no session or default-model fallback. */
export function seriesSendSelection(thread: HarnessThread, held?: Selection): Selection & { model: string; effort: string } {
  const selection = threadSelection(thread, held, null);
  if (!selection.model?.trim() || !selection.effort?.trim()) {
    throw new Error("Choose a model and reasoning level in this series' chat before making a part.");
  }
  return { ...selection, model: selection.model, effort: selection.effort };
}

export function seriesPartRequest(series: StudioSeries, partNumber: number): { text: string; draft: string } {
  const part = series.parts.find((p) => p.number === partNumber);
  if (!part) throw new Error("This part is not in the series outline.");
  if (part.made) throw new Error("This part already has a render.");
  return {
    text: `Make part ${partNumber}`,
    draft: `/oculus-studio Make part ${partNumber} of the series \`${series.slug}\` (video \`${part.slug}\`).`,
  };
}

/** The composer's ordinary Enter, including the student's follow-up preference. */
export function seriesSendMode(inputs: SteerInputs, followUp: FollowUp) {
  return deliveryMode(sendAction({ running: inputs.running, steer: steerKind(inputs), followUp, flip: false, command: false }));
}
