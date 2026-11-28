import { createContext, useContext } from "react";
import type { useSideNavPanel } from "@/hooks/ui/useSideNavPanel";

export type SubjectPanel = ReturnType<typeof useSideNavPanel>;

/**
 * The subject's nav column, for a tab that draws its own header row. A
 * context, not the outlet's: that carries the subject (`useSubject`).
 * It imports no app code at runtime, so no other file's edit makes the dev
 * server hand a page loaded later a second copy that nothing provides.
 */
export const SubjectPanelContext = createContext<SubjectPanel | null>(null);

/** The subject's nav column, for a tab drawing its own header's toggle. */
export function useSubjectPanel(): SubjectPanel {
  const panel = useContext(SubjectPanelContext);
  if (!panel) throw new Error("useSubjectPanel outside SubjectLayout");
  return panel;
}
