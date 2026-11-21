import { useNavigate } from "react-router-dom";
import { CaretLeft, CaretRight, Queue } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { videoHref } from "@/lib/studio/routes";
import { partNav } from "@/lib/studio/seriesView";
import type { SeriesPart, StudioSeries } from "@/lib/studio/videos";

/** The bar over a part's picture: the series' name, and Previous and Next
 *  between made parts (`partNav`); an off button says which part isn't made. */
export function SeriesBar({ series, number }: { series: StudioSeries; number: number }) {
  const nav = partNav(series, number);
  return (
    <div className="flex min-h-8 items-center gap-2">
      <Queue size={16} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate text-[13px] font-medium">{series.title}</span>
      <span className="flex-1" />
      <Step part={nav.previous} off={nav.previousOff} label="Previous" />
      <Step part={nav.next} off={nav.nextOff} label="Next" />
    </div>
  );
}

function Step({ part, off, label }: { part: SeriesPart | null; off: string | null; label: "Previous" | "Next" }) {
  const navigate = useNavigate();
  const href = part ? videoHref(part.slug, part.title) : undefined;
  const button = (
    <Button
      variant="outline"
      size="sm"
      disabled={!part}
      data-tab-href={href}
      onClick={() => href && navigate(href)}
      className={label === "Previous" ? "pl-3" : "pr-3"}
    >
      {label === "Previous" && <CaretLeft size={14} />}
      {label}
      {label === "Next" && <CaretRight size={14} />}
    </Button>
  );
  if (part || !off) return button;
  // A disabled button takes no pointer events, so its wrapper holds the tooltip.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-full outline-none">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{off}</TooltipContent>
    </Tooltip>
  );
}
