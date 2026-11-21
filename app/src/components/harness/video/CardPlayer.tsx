import { Skeleton } from "@/components/ui/skeleton";
import { useVideoDetail } from "@/hooks/studio/useVideoDetail";
import { openVideoBeside } from "@/lib/studio/openVideo";
import { InlineVideo } from "./InlineVideo";

/** What the card's player plays: a video (the card's, or another part of
 *  its series) from a second; a new `n` asks again. */
export interface CardPlay {
  slug: string;
  at: number;
  n: number;
}

/** The card's inline player for whichever video it was asked to play; its
 *  control bar's expand button opens that video's page beside the chat. */
export function CardPlayer({ play }: { play: CardPlay }) {
  const { detail, error } = useVideoDetail(play.slug);
  if (!detail) {
    return error ? (
      <p className="text-[12.5px] leading-snug text-destructive">{error}</p>
    ) : (
      <Skeleton className="aspect-video w-full rounded-xl" />
    );
  }
  return (
    <InlineVideo
      key={play.slug}
      detail={detail}
      request={play}
      onOpenBeside={() => openVideoBeside(detail.row.slug, detail.row.title)}
    />
  );
}
