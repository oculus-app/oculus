import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import { DotsThree, Trash } from "@phosphor-icons/react";

import { usePaneTab, useTabId } from "@/components/tabs/TabContext";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isWindows } from "@/lib/platform";
import { VIDEOS_HREF } from "@/lib/studio/routes";
import { afterVideoDelete, deleteVideoBlocker, deleteVideoPrompt } from "@/lib/studio/videoActions";
import { deleteVideo, type VideoDetail } from "@/lib/studio/videos";
import { cn } from "@/lib/utils";
import { useTabStore } from "@/stores/shell/tabStore";
import { useNarrateStore } from "@/stores/studio/narrateStore";
import { useRenderStore } from "@/stores/studio/renderStore";
import { useVideosStore } from "@/stores/studio/videosStore";

const ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] outline-none data-highlighted:bg-accent";

/**
 * The ⋯ after the video page's button: Delete video…, which asks first and
 * moves the folder to the Trash. Off, with a tooltip saying why, while a
 * render or a narration of the folder or the thread's turn runs. Afterwards a series' part
 * stays as its "not made" view; any other video leaves the page
 * (`afterVideoDelete`).
 */
export function VideoMenu({
  detail,
  title,
  part,
  running,
}: {
  detail: VideoDetail;
  title: string;
  /** The video's number in its series, when it is a part of one. */
  part: number | null;
  /** The video's thread is running a turn. */
  running: boolean;
}) {
  const { dir, slug } = detail.row;
  const rendering = useRenderStore((s) => dir in s.active);
  const narrating = useNarrateStore((s) => dir in s.active);
  const blocker = deleteVideoBlocker({ rendering, narrating, running });
  const prompt = deleteVideoPrompt({ title, part, windows: isWindows });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { tabId, side } = usePaneTab();
  const paneId = useTabId();

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteVideo(slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      return;
    }
    const reloaded = useVideosStore.getState().reload();
    const where = afterVideoDelete({ part: part != null, inSide: side === "side" });
    if (where === "stay") {
      // The page turns into the part's "not made" view once the list says so.
      await reloaded;
      setBusy(false);
      setConfirm(false);
    } else if (where === "close-side") {
      useTabStore.getState().removeSide(tabId, paneId);
    } else {
      navigate(VIDEOS_HREF);
    }
  };

  const item = (
    <DropdownMenu.Item
      disabled={!!blocker}
      onSelect={() => {
        setError(null);
        setConfirm(true);
      }}
      className={cn(
        ITEM,
        "text-destructive data-highlighted:bg-destructive/10",
        blocker && "cursor-default opacity-50",
      )}
    >
      <span className="flex size-4 items-center justify-center text-destructive">
        <Trash size={14} />
      </span>
      <span className="flex-1">Delete video…</span>
    </DropdownMenu.Item>
  );

  return (
    <>
      {/* Not modal: the confirm dialog opens from it, and a modal menu's
          body lock fights the dialog's. */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${title}`}
            title="More"
            className="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
          >
            <DotsThree size={16} weight="bold" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="end"
            sideOffset={4}
            collisionPadding={12}
            className="popup-motion z-50 min-w-48 rounded-xl border border-border-subtle bg-popover p-1 text-popover-foreground shadow-lg outline-none"
            // The confirm dialog takes focus; the trigger must not take it back.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {blocker ? (
              <Tooltip>
                {/* A disabled item never highlights, so its wrapper holds the tooltip. */}
                <TooltipTrigger asChild>
                  <div>{item}</div>
                </TooltipTrigger>
                <TooltipContent side="left">{blocker}</TooltipContent>
              </Tooltip>
            ) : (
              item
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void remove()}
        title={prompt.title}
        description={prompt.description}
        confirmLabel={prompt.confirmLabel}
        busyLabel={prompt.busyLabel}
        busy={busy}
      >
        {error && <p className="text-[12.5px] leading-snug text-destructive">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
