import { useContext } from "react";
import {
  BookOpen,
  CaretLeft,
  CaretRight,
  File as FileIcon,
  Rows,
} from "@phosphor-icons/react";
import { PaneToolbar } from "@/components/tabs/PaneHeader";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LayoutMode, Shown } from "./layout";
import { PdfToolbarEnd } from "./toolbarEnd";

interface Props {
  mode: LayoutMode;
  onMode: (mode: LayoutMode) => void;
  numPages: number;
  shown: Shown;
  /** The page box's text: the live range, or the draft while it has focus. */
  pageText: string;
  /** The live range, which sizes the box. */
  pageLabel: string;
  onPageDraft: (draft: string | null) => void;
  onJump: (text: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

/** The one slim control row: layout and page on the left, the host's
 *  controls (`PdfToolbarEnd`) at its right end. */
export function PdfToolbar({
  mode,
  onMode,
  numPages,
  shown,
  pageText,
  pageLabel,
  onPageDraft,
  onJump,
  onPrev,
  onNext,
}: Props) {
  const end = useContext(PdfToolbarEnd);
  const paged = mode !== "scroll" && numPages > 1;
  const controls = (
  <>
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onMode(v as LayoutMode)}
      variant="outline"
      size="sm"
      className="shrink-0"
    >
      <ModeItem value="scroll" label="Continuous scroll">
        <Rows size={12} />
      </ModeItem>
      <ModeItem value="single" label="Single page">
        <FileIcon size={12} />
      </ModeItem>
      <ModeItem value="spread" label="Two-page spread">
        <BookOpen size={12} />
      </ModeItem>
    </ToggleGroup>

    {numPages > 0 && (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {paged && (
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={shown.first <= 1}
            onClick={onPrev}
            aria-label="Previous page"
          >
            <CaretLeft size={13} />
          </Button>
        )}
        <label className="flex h-6 cursor-text items-center gap-1 rounded-md border border-input px-2 text-xs tabular-nums text-muted-foreground shadow-none transition-[color,box-shadow] focus-within:border-ring focus-within:text-foreground focus-within:ring-[3px] focus-within:ring-ring/25 dark:bg-input/30">
          <input
            value={pageText}
            aria-label="Page"
            inputMode="numeric"
            spellCheck={false}
            autoComplete="off"
            // Focus by hand so the click doesn't drop a caret into the
            // selection `onFocus` makes.
            onMouseDown={(e) => {
              if (document.activeElement === e.currentTarget) return;
              e.preventDefault();
              e.currentTarget.focus();
            }}
            onFocus={(e) => {
              onPageDraft(String(shown.first));
              e.currentTarget.select();
            }}
            onChange={(e) => onPageDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={() => onPageDraft(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onJump(e.currentTarget.value);
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                e.currentTarget.blur();
              }
            }}
            // Sized to the idle label so focusing doesn't resize it.
            style={{
              width: `${Math.max(pageText.length, pageLabel.length)}ch`,
            }}
            className="bg-transparent p-0 text-center outline-none"
          />
          <span aria-hidden>/ {numPages}</span>
        </label>
        {paged && (
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={shown.last >= numPages}
            onClick={onNext}
            aria-label="Next page"
          >
            <CaretRight size={13} />
          </Button>
        )}
      </div>
    )}
  </>
  );
  return (
    <PaneToolbar className="bg-surface" end={end}>
      {controls}
    </PaneToolbar>
  );
}

function ModeItem({
  value, label, children,
}: {
  value: LayoutMode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToggleGroupItem
          value={value}
          aria-label={label}
          className="h-6 px-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {children}
        </ToggleGroupItem>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
