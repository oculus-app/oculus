/**
 * What the video page decides about deleting a video or one of its renders.
 * Pure, so the decisions are tested without React; `VideoMenu` and the
 * Export rows only draw what these return.
 */

import { CHAT_AT_WORK, WAIT_FOR_NARRATION } from "@/lib/studio/videoControls";

/** Where a deleted file goes: the Trash, or the Recycle Bin on Windows. */
export function trashName(windows: boolean): string {
  return windows ? "Recycle Bin" : "Trash";
}

/** Why Delete video… is off, as its tooltip; null when it is on. A running
 *  render, narration or turn is still writing into the folder. */
export function deleteVideoBlocker({
  rendering,
  narrating,
  running,
}: {
  rendering: boolean;
  narrating: boolean;
  running: boolean;
}): string | null {
  if (rendering) return "Cancel the render first";
  if (narrating) return WAIT_FOR_NARRATION;
  if (running) return CHAT_AT_WORK;
  return null;
}

export interface DeleteVideoPrompt {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
}

/** The confirm dialog's words; `part` is the video's number in its series. */
export function deleteVideoPrompt({
  title,
  part,
  windows,
}: {
  title: string;
  part: number | null;
  windows: boolean;
}): DeleteVideoPrompt {
  const trash = trashName(windows);
  const moves = `Its script, narration and renders move to the ${trash}.`;
  return {
    title: `Delete “${title}”?`,
    description: part != null ? `${moves} Part ${part} goes back to not made.` : moves,
    confirmLabel: `Move to ${trash}`,
    busyLabel: `Moving to ${trash}`,
  };
}

/** Where the page goes once its video is deleted. A series' part stays, as
 *  its "not made" view; a video beside its chat closes that side item; any
 *  other leaves for the Videos grid. */
export type AfterVideoDelete = "stay" | "close-side" | "videos";

export function afterVideoDelete({ part, inSide }: { part: boolean; inSide: boolean }): AfterVideoDelete {
  if (part) return "stay";
  return inSide ? "close-side" : "videos";
}
