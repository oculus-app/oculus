import { PillTabs } from "@/components/ui/table/PillTabs";
import { displayCode } from "@/lib/format/format";

export const ALL = "all";

/** The grid's chosen subject, which New video also starts its thread in. */
export const SUBJECT_KEY = "oculus-studio-subject";
export const readSubject = (raw: string | null) => raw ?? ALL;

/** The grid's subject as stored now, or null for All: read at a press, since
 *  each `useStoredState` copy reads storage only once. */
export function storedSubject(): string | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SUBJECT_KEY);
  } catch {
    /* No storage: All. */
  }
  const subject = readSubject(raw);
  return subject === ALL ? null : subject;
}

/** Pills over the grid: All, then each subject that has a video. Hidden when
 *  there is only one thing to choose. */
export function SubjectPills({
  subjects,
  value,
  onChange,
}: {
  /** Course codes, in the order to show them. */
  subjects: string[];
  value: string;
  onChange: (subject: string) => void;
}) {
  if (subjects.length < 2) return null;
  return (
    <PillTabs
      tabs={[{ value: ALL, label: "All" }, ...subjects.map((s) => ({ value: s, label: displayCode(s) }))]}
      value={value}
      onChange={onChange}
      className="flex-wrap gap-1"
    />
  );
}
