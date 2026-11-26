import { StickyDock } from "@/components/ui/layout/StickyDock";
import type { Subject } from "@/lib/db";
import { OverviewAskBar } from "./AskBar";

/** The ask bar, docked at the bottom of the Overview's own scroller in the
 *  same column as the rows above (`StickyDock`). */
export function AskDock({ subject }: { subject: Subject }) {
  return (
    <StickyDock className="mt-auto">
      <OverviewAskBar subject={subject} />
    </StickyDock>
  );
}
