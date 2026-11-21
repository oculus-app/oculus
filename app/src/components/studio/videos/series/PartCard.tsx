import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CircleNotch, FilmSlate } from "@phosphor-icons/react";

import { MediaTile } from "@/components/ui/layout/MediaGrid";
import { videoHref } from "@/lib/studio/routes";
import type { SeriesPart } from "@/lib/studio/videos";

export type PartCardState = "idle" | "working";

/** A part not made yet: an empty card with its title and number that opens
 *  the part's page. While it is being made its frame says so; `action` (Make
 *  this part, on the next part only) sits over the frame. */
export function PartCard({ part, state, action }: { part: SeriesPart; state: PartCardState; action?: ReactNode }) {
  const navigate = useNavigate();
  const href = videoHref(part.slug, part.title);
  return (
    <MediaTile
      href={href}
      onOpen={() => navigate(href)}
      title={part.title}
      muted
      meta={<span className="tabular-nums">Part {part.number}</span>}
      frameClassName="flex items-center justify-center border-dashed border-input bg-card text-muted-foreground"
      action={state === "idle" ? action : undefined}
      picture={
        state === "working" ? (
          <span className="flex items-center gap-1.5 text-[12.5px]">
            <CircleNotch size={13} className="animate-spin text-brand" />
            Making…
          </span>
        ) : action ? null : (
          <FilmSlate size={22} weight="light" className="opacity-55" />
        )
      }
    />
  );
}
