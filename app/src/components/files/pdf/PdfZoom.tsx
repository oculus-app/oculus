import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_ZOOM, MIN_ZOOM } from "./layout";

/** One press, as a ratio. */
const ZOOM_STEP = 1.1;

/**
 * The viewer's zoom, floating over the pages' bottom left corner in the
 * lightbox toolbar's grammar: out, the size (a click fits the page), in.
 * Glass over the page (a see-through ground that blurs what is under it,
 * never `opacity`, which would thin the blur too) until the pointer or
 * keyboard focus is on it. Only the pill takes clicks.
 */
export function PdfZoom({ scale, onZoom, onReset }: {
  scale: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-card/30 p-1 text-xs text-foreground backdrop-blur-md transition-colors hover:bg-card/70 has-[:focus-visible]:bg-card/70">
        <Step label="Zoom out" onClick={() => onZoom(1 / ZOOM_STEP)} disabled={scale <= MIN_ZOOM}>
          <MagnifyingGlassMinus size={14} />
        </Step>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onReset}
              aria-label="Fit page"
              className="w-11 cursor-pointer text-center tabular-nums transition-colors hover:text-foreground"
            >
              {Math.round(scale * 100)}%
            </button>
          </TooltipTrigger>
          <TooltipContent>Fit page</TooltipContent>
        </Tooltip>
        <Step label="Zoom in" onClick={() => onZoom(ZOOM_STEP)} disabled={scale >= MAX_ZOOM}>
          <MagnifyingGlassPlus size={14} />
        </Step>
      </div>
    </div>
  );
}

function Step({ label, onClick, disabled, children }: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
