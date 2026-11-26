import type { ReactNode } from "react";
import { useState } from "react";
import { useFoldMotion } from "@/components/harness/timeline/useFoldMotion";

/**
 * A Subject group's rows, easing open and shut with the timeline's folds
 * (`useFoldMotion`). Every change of `open` animates; the first draw does
 * not. Shut, the rows stay mounted until the close finishes.
 */
export function GroupRows({ open, children }: { open: boolean; children: ReactNode }) {
  const motion = useFoldMotion(open);
  const [was, setWas] = useState(open);
  if (was !== open) {
    setWas(open);
    motion.animateNext(open);
  }
  if (!motion.mounted) return null;
  return (
    <div ref={motion.body} className="flex flex-col gap-0.5">
      {children}
    </div>
  );
}
