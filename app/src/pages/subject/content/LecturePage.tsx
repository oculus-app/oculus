import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { getLectures, type Lecture } from "@/lib/db";
import { LecturePlayer } from "@/components/lectures/LecturePlayer";
import { LoadingFill } from "@/components/ui/layout/PageParts";
import { PaneHeaderRow } from "@/components/tabs/PaneHeader";
import { LECTURES_TAB, SubjectTrail } from "@/components/subjects/SubjectCrumbs";
import { recordRecent } from "@/lib/activity/recents";

/**
 * A lecture as its own page, in a tab or in the side panel. Standalone, so
 * the player has the height; one breadcrumb row leads back to the subject.
 */
export default function SubjectLecturePage() {
  const { subjectId } = useParams();
  const [searchParams] = useSearchParams();
  const lectureId = searchParams.get("id");
  const id = Number(subjectId);

  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!Number.isFinite(id) || !lectureId) return;
    const rows = await getLectures(id);
    setLecture(rows.find((l) => l.id === lectureId) ?? null);
    setLoaded(true);
  }, [id, lectureId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (lecture) {
      recordRecent(lecture.subject_id, {
        kind: "lecture",
        ref: lecture.id,
        title: lecture.title,
      });
    }
  }, [lecture?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!Number.isFinite(id) || !lectureId) return <Navigate to="/subjects" replace />;

  if (!lecture) {
    if (!loaded) return <LoadingFill />;
    // Loaded but gone — a stale tab after a re-sync.
    return <Navigate to={`/subjects/${id}/lectures`} replace />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <PaneHeaderRow className="h-11 shrink-0 flex items-center gap-2.5 px-5 border-b border-border-subtle">
        <SubjectTrail subjectId={id} tab={LECTURES_TAB} title={lecture.title} />
      </PaneHeaderRow>
      <LecturePlayer lecture={lecture} onRefresh={refresh} startAt={searchParams.has("at") ? Number(searchParams.get("at")) : undefined} />
    </div>
  );
}
