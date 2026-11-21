import { FactLine, SubjectFact } from "@/components/studio/videos/VideoFacts";
import { MediaTile } from "@/components/ui/layout/MediaGrid";
import { fmtAgo } from "@/lib/format/format";
import { madePartCount } from "@/lib/studio/series";
import type { StudioSeries } from "@/lib/studio/videos";
import { FolderSlots } from "./FolderSlots";

/** A series in the grid: one card whose frame holds its parts. A press opens
 *  the folder in place (its parts follow it as cards) and a second closes it. */
export function FolderCard({ series, open, onToggle }: { series: StudioSeries; open: boolean; onToggle: () => void }) {
  return (
    <MediaTile
      title={series.title}
      expanded={open}
      onOpen={onToggle}
      frameClassName={open ? "border-brand/60 bg-card" : "bg-surface"}
      picture={<FolderSlots parts={series.parts} />}
      meta={
        <FactLine
          facts={[
            series.subject && <SubjectFact course={series.subject} />,
            `${madePartCount(series)}/${series.parts.length} videos`,
            series.modified != null && fmtAgo(series.modified * 1000),
          ]}
        />
      }
    />
  );
}
