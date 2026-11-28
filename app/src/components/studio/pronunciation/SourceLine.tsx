import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FilmSlate } from "@phosphor-icons/react";

import { displayCode, fmtAgo, fmtFullStamp, humanizeSlug } from "@/lib/format/format";
import { utcStampMs } from "@/lib/studio/pronunciationView";
import { videoHref } from "@/lib/studio/routes";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useTabStore } from "@/stores/shell/tabStore";
import { useVideosStore } from "@/stores/studio/videosStore";
import { LibraryLabel } from "./LibraryLabel";

const LINK = "inline-flex min-w-0 cursor-pointer items-center gap-1 transition-colors hover:text-foreground hover:underline";

/**
 * Where a reading came from, on one muted line: the subject (a link to it)
 * or Global, the video (a link to it in Studio) or how it was written by
 * hand, and how long ago. A click opens it here, ⌘-click or a middle click
 * a new tab.
 */
export function SourceLine({ subject, video, at, manual = "Added by hand" }: {
  subject: string | null;
  /** The video's slug; null for an entry written by hand. */
  video: string | null;
  /** Said in the video's place when there is none. */
  manual?: string;
  /** `YYYY-MM-DDTHH:MM:SS`, UTC. */
  at: string;
}) {
  const navigate = useNavigate();
  const subjects = useHarnessStore((s) => s.subjects);
  const title = useVideosStore((s) => (video ? s.videos.find((v) => v.slug === video)?.title : undefined));

  const match = subject
    ? (() => {
        // A video names its course by its full code or by the code without its term.
        const exact = subjects.find((s) => s.code === subject);
        if (exact) return exact;
        const rows = subjects.filter((s) => displayCode(s.code) === subject);
        return rows.find((s) => s.is_current) ?? rows[0] ?? null;
      })()
    : null;
  const subjectHref = match ? `/subjects/${match.id}` : null;
  const videoTitle = video ? (title ?? humanizeSlug(video)) : null;
  const studioHref = video ? videoHref(video, videoTitle) : null;
  const ms = utcStampMs(at);

  const open = (href: string, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) useTabStore.getState().addTab(href);
    else navigate(href);
  };
  const middle = (href: string, e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    useTabStore.getState().addTab(href);
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
      {subjectHref ? (
        <button
          type="button"
          data-tab-href={subjectHref}
          onClick={(e) => open(subjectHref, e)}
          onAuxClick={(e) => middle(subjectHref, e)}
          className={LINK}
        >
          <LibraryLabel subject={subject} />
        </button>
      ) : (
        <LibraryLabel subject={subject} />
      )}
      <span aria-hidden>·</span>
      {studioHref && videoTitle ? (
        <button
          type="button"
          data-tab-href={studioHref}
          onClick={(e) => open(studioHref, e)}
          onAuxClick={(e) => middle(studioHref, e)}
          className={LINK}
        >
          <FilmSlate size={12} className="shrink-0" />
          <span className="truncate">{videoTitle}</span>
        </button>
      ) : (
        <span>{manual}</span>
      )}
      {ms != null && (
        <>
          <span aria-hidden>·</span>
          <span title={fmtFullStamp(ms)}>{fmtAgo(ms)}</span>
        </>
      )}
    </div>
  );
}
