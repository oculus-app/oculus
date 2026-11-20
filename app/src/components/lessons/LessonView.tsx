import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileViewer } from "@/components/files/FileViewer";
import type { DbFile } from "@/lib/db";
import { defaultSlide, isChallengeSlide, slideFiles, slideKey, slideMdPath, slideWorkspace, type LessonIndex } from "@/lib/ed/lessons";
import { useLiveLessonIndex } from "@/lib/ed/slideStatus";
import { markSlideOpened } from "@/lib/ed/views";
import { resyncWorkspace } from "@/lib/ed/workspace";
import { openFileSmart, recordFileAccess } from "@/lib/files/openFile";
import { LessonSidebar } from "./LessonSidebar";
import { ChallengeHeader, type ChallengeView } from "./ChallengeHeader";
import { QuietNote } from "./QuietNote";
import { WorkspacePane } from "./WorkspacePane";

/**
 * An Ed lesson as Ed shows it: its slides down the left, the selected one on
 * the right — a PDF slide in the PDF viewer, any other as its markdown. A
 * challenge's header switches between its brief and its workspace's files,
 * read-only, and opens it on Ed, where it is edited, run and marked. The
 * slide rides in the URL (`&slide=<id>`), so a restored tab or
 * Back reopens it; without one the lesson opens on its first slide not yet
 * completed.
 */
export function LessonView({
  file,
  index,
  files,
  title,
}: {
  /** The lesson's index file. */
  file: DbFile;
  index: LessonIndex;
  /** The subject's files, to find each slide's rows. */
  files: DbFile[];
  title: string;
}) {
  const [params, setParams] = useSearchParams();
  // Statuses as Ed has them since this session opened slides; the slide it
  // opens on still comes from the synced index, so a tick never moves it.
  const live = useLiveLessonIndex(index);
  const wanted = params.get("slide");
  const found = wanted == null ? -1 : index.slides.findIndex((s, i) => slideKey(s, i) === wanted);
  const fallback = defaultSlide(index.slides);
  const selected = found >= 0 ? found : fallback ? index.slides.indexOf(fallback) : 0;
  const slide = index.slides[selected];

  const select = useCallback((position: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("slide", slideKey(index.slides[position], position));
      return next;
    }, { replace: true });
  }, [index.slides, setParams]);

  const { md, pdf } = slideFiles(file, slide, files);
  // A PDF slide's PDF until it is synced falls back to the slide's own page,
  // which links to it.
  const shown = (slide.pdf ? pdf : undefined) ?? md;
  const challenge = isChallengeSlide(slide);
  // Each slide opens on its description: a view picked on another slide is moot.
  const [picked, setPicked] = useState<{ slide: number; view: ChallengeView } | null>(null);
  const view: ChallengeView = picked?.slide === selected ? picked.view : "description";
  const slideMd = slideMdPath(file, slide);
  const challengeId = slide.challengeId;
  const resync =
    challengeId != null && slideMd
      ? () => resyncWorkspace({ subjectId: file.subject_id, challengeId, title: slide.title, slideMd })
      : undefined;

  // Each slide opened clears its never-opened mark, as a file page does.
  const mdId = md?.id;
  const pdfId = pdf?.id;
  useEffect(() => {
    for (const id of [mdId, pdfId]) {
      if (id != null) recordFileAccess({ id, subject_id: file.subject_id });
    }
  }, [mdId, pdfId, file.subject_id]);
  // …and tells Ed, which marks the slide seen and completes a reading.
  const slideId = slide.id;
  const slideType = slide.type;
  const slideStatus = live.slides[selected]?.status ?? null;
  useEffect(() => {
    // Sent once per app session, so the status Ed answers sends nothing more.
    if (slideId != null) markSlideOpened(slideId, slideType, slideStatus);
  }, [slideId, slideType, slideStatus]);

  return (
    <div className="flex min-h-0 flex-1">
      <LessonSidebar
        title={title}
        index={live}
        selected={selected}
        onSelect={select}
        edUrl={slide.url ?? index.url}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {challenge && (
          /* Keyed, so a resync's outcome stays with its slide. */
          <ChallengeHeader
            key={`strip:${selected}`}
            view={view}
            onView={(v) => setPicked({ slide: selected, view: v })}
            edUrl={slide.url}
            onResync={resync}
          />
        )}
        {challenge && view === "workspace" ? (
          <WorkspacePane key={selected} entries={slideWorkspace(file, slide, files)} files={files} />
        ) : shown ? (
          /* In-slide links open the linked file beside this page. */
          <FileViewer key={shown.id} file={shown} files={files} onOpenFile={openFileSmart} />
        ) : (
          <QuietNote title="Not synced yet" detail="The next sync fetches this slide." />
        )}
      </div>
    </div>
  );
}
