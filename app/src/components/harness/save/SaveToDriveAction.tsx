import type { MouseEvent } from "react";
import { CircleNotch, FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSubjects } from "@/hooks/data/useSubjects";
import { driveErrorText } from "@/lib/drive/commands";
import { parentRel } from "@/lib/drive/paths";
import { driveTrail } from "@/lib/drive/trail";
import { openCitation } from "@/lib/files/openFile";
import { cn } from "@/lib/utils";
import { useChatSave, useChatSaves, type SaveState } from "@/stores/chat/chatSaveStore";
import { useChatSaveScope } from "./ChatSaveScope";

/**
 * Where the control sits, which sets its size: under a picture or page
 * (`caption`, 24px in a 28px line), in the lightbox's toolbar (`toolbar`), at
 * the end of a Write or Edit row (`row`), or an icon with its label as a
 * tooltip (`icon`: a page's header, the Made list, a question's hover row).
 */
export type SaveLook = "caption" | "toolbar" | "row" | "icon";

/** "Save to Drive…" before, "Open in Drive" after; while unsaved it shows
 *  only when its `reveal` group is hovered or focused. */
const LOOK: Record<SaveLook, { box: string; icon: number }> = {
  caption: { box: "h-6 gap-1 px-2 text-xs", icon: 12 },
  toolbar: { box: "h-8 gap-1.5 pr-3 pl-2.5 text-xs", icon: 14 },
  row: { box: "h-5 gap-1 px-2 text-[11px]", icon: 12 },
  icon: { box: "size-6 justify-center", icon: 14 },
};

/** The control's words for a state. A failed save reads as the offer again,
 *  in its normal look: saving is only ever an option, never a state the reply
 *  nags about, so the last failure's reason is the tooltip and nothing else.
 *  `tip` is null where there is none, and for a saved copy, whose tooltip
 *  names its folder (`SavedWhere`). */
export function saveWords(state: NonNullable<SaveState>, look: SaveLook): { label: string; tip: string | null } {
  const label = state.saved ? "Open in Drive" : state.saving ? "Saving…" : "Save to Drive…";
  if (state.saved) return { label, tip: null };
  return { label, tip: state.failed ? driveErrorText(state.failed) : look === "icon" ? label : null };
}

/** The control for one workspace file (`.oculus/agents/…`). Nothing at all
 *  outside a chat, for a file the student may not keep (the agent's own,
 *  which Rust's `savable` refuses), and while that is still being asked. */
export function SaveToDriveAction({
  path,
  look,
  reveal,
  className,
}: {
  path: string;
  look: SaveLook;
  /** The `group-hover` variant of what reveals it while unsaved, e.g.
   *  `group-hover/embed:opacity-100`; left out, it always shows. */
  reveal?: string;
  className?: string;
}) {
  const scope = useChatSaveScope();
  const state = useChatSave(scope ? path : null);
  if (!scope || !state) return null;
  return <SaveControl path={path} look={look} reveal={reveal} className={className} state={state} subjectId={scope.subjectId} />;
}

/** The control for a file whose state is known. */
export function SaveControl({
  path,
  look,
  reveal,
  className,
  state,
  subjectId,
}: {
  path: string;
  look: SaveLook;
  reveal?: string;
  className?: string;
  state: NonNullable<SaveState>;
  subjectId: number | null;
}) {
  const { saved, saving } = state;
  const size = LOOK[look];
  const { label, tip: words } = saveWords(state, look);
  const Icon = saved ? FolderSimple : saving ? CircleNotch : FolderSimplePlus;
  const hidden = !saved && !saving && !!reveal;
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (saved) openCitation({ path: saved.relativePath }, e.metaKey || e.ctrlKey);
    else void useChatSaves.getState().save(path, subjectId);
  };
  const button = (
    <button
      type="button"
      aria-label={label}
      disabled={saving}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center rounded-full font-medium whitespace-nowrap select-none",
        "transition-[color,background-color,opacity] will-change-[opacity] hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        size.box,
        look === "toolbar" ? "text-foreground" : "text-muted-foreground",
        hidden && cn("opacity-0", reveal),
        className,
      )}
    >
      <Icon size={size.icon} className={cn("shrink-0", saving && "animate-spin")} />
      {look !== "icon" && label}
    </button>
  );
  const tip = saved ? <SavedWhere rel={saved.relativePath} /> : words;
  if (!tip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/** "Saved to COMP30026 › Diagrams": the copy's folder from its subject, or
 *  "My Drive" at the top level. Mounted only while the tooltip is open. */
function SavedWhere({ rel }: { rel: string }) {
  const { subjects } = useSubjects();
  const where = driveTrail(parentRel(rel), subjects, "subject")
    .map((part) => part.label)
    .join(" › ");
  return <>Saved to {where}</>;
}
