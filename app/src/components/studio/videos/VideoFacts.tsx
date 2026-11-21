import { Fragment, type ReactNode } from "react";

import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { displayCode } from "@/lib/format/format";
import { fmtClockSecs } from "@/lib/lectures/media";

/** A card's fact line: the facts that are there, joined by middle dots. */
export function FactLine({ facts }: { facts: ReactNode[] }) {
  const shown = facts.filter((f) => f != null && f !== false && f !== "");
  return (
    <span className="tabular-nums">
      {shown.map((fact, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          {fact}
        </Fragment>
      ))}
    </span>
  );
}

/** A subject as the app names it: its icon and display code, the full code
 *  as the tooltip. `code` is a course code; the icon store keys by display code. */
export function SubjectFact({ code }: { code: string }) {
  return (
    <span title={code}>
      <SubjectIcon code={code} size={11} className="mr-1 inline-block align-[-1px]" />
      {displayCode(code)}
    </span>
  );
}

/** A video's length on its still, bottom right. */
export function LengthBadge({ seconds }: { seconds: number | null }) {
  if (seconds == null) return null;
  return (
    <span className="rounded-[5px] bg-black/70 px-1.5 py-px text-[11px] leading-[1.45] font-medium text-white tabular-nums">
      {fmtClockSecs(seconds)}
    </span>
  );
}
