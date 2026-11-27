import { CircleNotch, FolderOpen } from "@phosphor-icons/react";
import { driveTrailCrumbs } from "@/components/drive/trail/crumbs";
import { Trail } from "@/components/ui/Trail";
import { useSubjects } from "@/hooks/data/useSubjects";
import { stateWords, type Place, type Tone } from "@/lib/browser/downloads/describe";
import type { Download } from "@/lib/browser/downloads/types";
import { driveTrail } from "@/lib/drive/trail";
import { cn } from "@/lib/utils";

const TONE: Record<Tone, string> = {
  muted: "text-muted-foreground",
  brand: "text-brand",
  success: "text-success",
  error: "text-destructive",
};

/** Where it goes or went, as a trail: in Drive from its subject when it is
 *  in one (the row has little room), else from My Drive; on the Mac its
 *  folder's name. */
function PlaceTrail({ place }: { place: Place }) {
  const { subjects } = useSubjects();
  const crumbs = place.kind === "drive"
    ? driveTrailCrumbs(driveTrail(place.rel, subjects, "subject"), { size: 11, weight: "fill" })
    : [{ label: place.name, icon: <FolderOpen size={11} /> }];
  return <Trail crumbs={crumbs} className="flex-1 text-[11px] [&_[data-current]]:font-normal" />;
}

/** A download's state in words, with where it goes or went. */
export function DownloadState({ download }: { download: Download }) {
  const words = stateWords(download);
  return (
    <div className="min-w-0 text-[11px] leading-snug">
      <div className="flex min-w-0 items-center gap-1.5">
        {download.state === "delivering" ? (
          <CircleNotch size={11} className={cn("shrink-0 animate-spin", TONE[words.tone])} aria-hidden />
        ) : null}
        <span className={cn("shrink-0", TONE[words.tone])}>{words.text}</span>
        {words.place ? <PlaceTrail place={words.place} /> : null}
      </div>
      {words.detail ? (
        <p className={cn("break-words", words.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
          {words.detail}
        </p>
      ) : null}
    </div>
  );
}
