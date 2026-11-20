import { Books } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import type { SubjectOption } from "@/components/harness/composer/subjectOptions";

/** A scope choice's glyph: the subject's own icon, or the library's for General. */
export function SubjectOptionGlyph({ option, size }: { option: SubjectOption; size: number }) {
  return option.subject ? (
    <SubjectIcon code={option.subject.code} size={size} className="shrink-0" />
  ) : (
    <Books size={size} className="shrink-0 text-muted-foreground" />
  );
}
