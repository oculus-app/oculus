import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { StudioHeader } from "@/components/studio/StudioHeader";
import { PartsOutline } from "@/components/studio/series/PartsOutline";
import { SeriesBar } from "@/components/studio/series/SeriesBar";
import { UnmadePart } from "@/components/studio/series/UnmadePart";
import { ExportMenu } from "@/components/studio/video/ExportMenu";
import { RenderDraftButton } from "@/components/studio/video/RenderDraftButton";
import { VideoDetailStage } from "@/components/studio/video/VideoDetailStage";
import { VideoMenu } from "@/components/studio/video/VideoMenu";
import { WithPlayback } from "@/components/studio/video/WithPlayback";
import { Skeleton } from "@/components/ui/skeleton";
import { useMakeSeriesPart, type MakeSeriesPartState } from "@/hooks/studio/useMakeSeriesPart";
import { useVideoDetail } from "@/hooks/studio/useVideoDetail";
import { playableRenders } from "@/lib/studio/exports";
import { VIDEOS_HREF, videoHref } from "@/lib/studio/routes";
import { seriesPartForSlug, type SeriesMembership } from "@/lib/studio/series";
import { videoPageView } from "@/lib/studio/seriesView";
import { threadRunning } from "@/lib/studio/threadRunning";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useVideosStore } from "@/stores/studio/videosStore";

/** The page's width: the video fills it, though not past a sane size. */
const PAGE = "mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-6 py-5";

/**
 * /studio/videos/:slug: the player with the script and scenes in its dock,
 * and under it the facts, the render bar, Export (Render draft until the
 * video has a render) and the ⋯ menu that deletes the video. A series' part
 * adds the series bar over the picture and the Parts outline under the
 * facts; a part not made has this route too,
 * decided from the list, with its question and Make this part in the frame.
 * Opened beside the chat that makes it, it follows that thread's turns.
 */
export default function VideoPage() {
  const { slug = "" } = useParams();
  const loaded = useVideosStore((s) => s.loaded);
  const videos = useVideosStore((s) => s.videos);
  const series = useVideosStore((s) => s.series);
  const membership = useMemo(() => seriesPartForSlug({ videos, series }, slug), [videos, series, slug]);
  const row = useMemo(() => videos.find((v) => v.slug === slug) ?? null, [videos, slug]);
  // A part with no folder has nothing to read; the read starts when it appears.
  const { detail, error, reload } = useVideoDetail(membership && !membership.part.exists ? "" : slug);
  const part = membership?.part ?? null;
  const title = part?.title ?? row?.title ?? detail?.row.title ?? slug;
  const make = useMakeSeriesPart(membership?.series ?? null);
  // A part's chat is its own (`partThread`); a single video's is its link.
  const threadId = membership ? (make.threads[membership.part.number] ?? null) : (row?.threadId ?? detail?.row.threadId ?? null);
  // The agent may change the files while the page is open beside its chat:
  // read them again when its turn ends, the folder's time moves or the part gets its render.
  const running = useHarnessStore((s) => threadRunning(s, threadId));
  const modified = row?.modified;
  const made = part?.made;
  const seen = useRef({ running, modified, made });
  useEffect(() => {
    const was = seen.current;
    seen.current = { running, modified, made };
    if ((was.running && !running) || was.modified !== modified || was.made !== made) void reload();
  }, [running, modified, made, reload]);

  useEffect(() => {
    document.title = `${title} · Oculus`;
    return () => {
      document.title = "Oculus";
    };
  }, [title]);

  const view = videoPageView({ loaded, membership, detail, error });
  return (
    <>
      <StudioHeader
        title={title}
        meta={membership ? `Part ${membership.part.number}/${membership.series.parts.length}` : null}
        back={VIDEOS_HREF}
      />
      <div className="page-scroll min-h-0 flex-1">
        <div className={PAGE}>
          {membership && <SeriesBar series={membership.series} number={membership.part.number} />}
          {view === "player" && detail ? (
            <WithPlayback detail={detail} docked>
              {(playback) => (
                <VideoDetailStage
                  detail={detail}
                  playback={playback}
                  running={running}
                  onChanged={() => void reload()}
                  actions={
                    <div className="flex items-center gap-1">
                      {playableRenders(detail.renders).length === 0 ? (
                        <RenderDraftButton detail={detail} />
                      ) : (
                        <ExportMenu detail={detail} onChanged={() => void reload()} />
                      )}
                      <VideoMenu
                        detail={detail}
                        title={title}
                        part={membership?.part.number ?? null}
                        running={running}
                      />
                    </div>
                  }
                />
              )}
            </WithPlayback>
          ) : view === "error" ? (
            <p className="text-[12.5px] leading-snug text-destructive">{error}</p>
          ) : view === "loading" ? (
            <Skeleton className="aspect-video w-full rounded-xl" />
          ) : null}
          {membership && <SeriesParts membership={membership} make={make} unmade={view === "unmade"} />}
        </div>
      </div>
    </>
  );
}

/** A part's frame when it isn't made, and the outline under the page. */
function SeriesParts({ membership, make, unmade }: { membership: SeriesMembership; make: MakeSeriesPartState; unmade: boolean }) {
  const { series, part } = membership;
  const navigate = useNavigate();
  const onMake = (n: number) => make.make(series, n);
  return (
    <>
      {unmade && (
        <UnmadePart
          series={series}
          part={part}
          making={make.making}
          threadId={make.threads[part.number] ?? null}
          onMake={onMake}
        />
      )}
      <div className="mt-3 max-w-[760px]">
        <PartsOutline
          series={series}
          current={part.number}
          currentLabel="Watching"
          making={make.making}
          onMake={onMake}
          action={(p) => {
            if (p.number === part.number) return null;
            const href = videoHref(p.slug, p.title);
            return { label: `Open part ${p.number}`, href, onClick: () => navigate(href) };
          }}
        />
      </div>
    </>
  );
}
