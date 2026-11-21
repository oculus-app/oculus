import { displayCode } from "@/lib/format/format";

/** A video's subject is a course code without its term; the subject row
 *  it names is that course's current term, else its first. Its Canvas code
 *  is what `SubjectIcon` keys the course's glyph and colour from. */
export function subjectCodeFor(subjects: readonly { code: string; is_current: boolean }[], course: string): string {
  const matches = subjects.filter((s) => displayCode(s.code) === course);
  return (matches.find((s) => s.is_current) ?? matches[0])?.code ?? course;
}
