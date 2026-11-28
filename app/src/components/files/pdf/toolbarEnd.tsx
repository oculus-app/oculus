import { createContext, useContext, type ReactNode } from "react";
import { PaneToolbar } from "@/components/tabs/PaneHeader";

/**
 * The host's controls at the right end of the PDF's toolbar row: the file
 * page's PDF | Markdown switch and Draw. The row is always the viewer's own,
 * in the main pane and the side panel alike.
 */
export const PdfToolbarEnd = createContext<ReactNode>(null);

/** The toolbar row with only the host's controls, where the face below has
 *  no layout or page to set (the markdown, an Office file still converting),
 *  so switching faces leaves the controls where they were. */
export function PdfEndToolbar() {
  const end = useContext(PdfToolbarEnd);
  return end ? <PaneToolbar className="bg-surface" end={end} /> : null;
}
