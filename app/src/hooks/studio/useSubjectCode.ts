import { useSubjects } from "@/hooks/data/useSubjects";
import { subjectCodeFor } from "@/lib/studio/subjectCode";

/** The full subject code a video's course code names (`subjectCodeFor`), so
 *  `SubjectIcon` falls back to the colour the rest of the app shows. */
export function useSubjectCode(course: string): string {
  const { subjects } = useSubjects();
  return subjectCodeFor(subjects, course);
}
