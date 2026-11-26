import { useEffect, useMemo } from "react";
import { FilmSlate } from "@phosphor-icons/react";

import { StudioHeader } from "@/components/studio/StudioHeader";
import { StudioGrid } from "@/components/studio/videos/StudioGrid";
import { ALL, readSubject, SUBJECT_KEY, SubjectPills } from "@/components/studio/videos/SubjectPills";
import { Button } from "@/components/ui/button";
import { MediaGrid } from "@/components/ui/layout/MediaGrid";
import { EmptyState } from "@/components/ui/layout/PageParts";
import { Skeleton } from "@/components/ui/skeleton";
import { useStoredState } from "@/hooks/ui/useStoredState";
import { useStartVideo } from "@/hooks/studio/useNewVideoChat";
import { useOpenSeries } from "@/hooks/studio/useOpenSeries";
import { studioGridItems, studioSubjects } from "@/lib/studio/series";
import { useVideosStore } from "@/stores/studio/videosStore";

/** /studio/videos (and `/studio`): every video and series as a card, narrowed
 *  by subject; a series is a folder that opens in place. The nav column's New
 *  video row starts a video; the page offers it only while there is none. */
export default function VideosPage() {
  const { videos, series, loaded, error } = useVideosStore();
  const [chosen, setChosen] = useStoredState(SUBJECT_KEY, readSubject);
  const { open, toggle } = useOpenSeries(series, loaded && error == null);

  const subjects = useMemo(() => studioSubjects({ videos, series }), [videos, series]);
  // A remembered subject that no longer has a video or series shows everything.
  const filter = subjects.includes(chosen) ? chosen : ALL;
  const items = useMemo(() => studioGridItems({ videos, series }, filter === ALL ? null : filter), [videos, series, filter]);
  const empty = videos.length === 0 && series.length === 0;
  const startVideo = useStartVideo();
  // An agent or the CLI may have changed the folders since the layout read them.
  useEffect(() => {
    void useVideosStore.getState().reload();
  }, []);

  return (
    <>
      <StudioHeader title="Videos" />
      <div className="page-scroll min-h-0 flex-1">
        <div className="mx-auto max-w-5xl space-y-5 px-6 py-5">
          <SubjectPills subjects={subjects} value={filter} onChange={setChosen} />
          {!loaded ? (
            <MediaGrid>
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="aspect-video w-full rounded-xl" />
              ))}
            </MediaGrid>
          ) : error ? (
            <p className="text-[12.5px] leading-snug text-destructive">{error}</p>
          ) : empty ? (
            <EmptyState
              icon={<FilmSlate size={28} weight="light" className="text-muted-foreground" />}
              title="No videos yet"
              body="Describe one in a chat and the agent scripts, narrates and renders it."
            >
              <Button size="sm" onClick={() => startVideo(filter === ALL ? null : filter)}>
                New video
              </Button>
            </EmptyState>
          ) : (
            <StudioGrid items={items} open={open} onToggle={toggle} />
          )}
        </div>
      </div>
    </>
  );
}
