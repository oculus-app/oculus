import { Books } from "@phosphor-icons/react";

import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { displayCode } from "@/lib/format/format";
import { subjectCodeFor } from "@/lib/studio/subjectCode";
import { cn } from "@/lib/utils";
import { useHarnessStore } from "@/stores/chat/harnessStore";

/** A lexicon's owner as the page names it: a subject's icon and short code,
 *  or Global for the library's. */
export function LibraryLabel({ subject, size = 12, className }: {
  /** A course code, or null for the global library. */
  subject: string | null;
  size?: number;
  className?: string;
}) {
  const subjects = useHarnessStore((s) => s.subjects);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      {subject ? (
        <SubjectIcon code={subjectCodeFor(subjects, subject)} size={size} className="shrink-0" />
      ) : (
        <Books size={size} className="shrink-0" />
      )}
      <span className="truncate">{subject ? displayCode(subject) : "Global"}</span>
    </span>
  );
}
