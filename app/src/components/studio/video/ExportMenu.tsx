import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowSquareUpRight, CaretDown, CheckCircle, CircleNotch, FolderOpen, Trash } from "@phosphor-icons/react";

import { driveTrailCrumbs } from "@/components/drive/trail/crumbs";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Trail } from "@/components/ui/Trail";
import { useSubjects } from "@/hooks/data/useSubjects";
import { reloadExportStatus, useExportStatus } from "@/hooks/studio/useExportStatus";
import { baseName, parentRel } from "@/lib/drive/paths";
import { driveFolderHref } from "@/lib/drive/routes";
import { driveTrail } from "@/lib/drive/trail";
import { isWindows } from "@/lib/platform";
import { menuState, PRESET_LABEL, presetHint, suggestedName } from "@/lib/studio/exports";
import { deleteRender, type DriveFile, type ExportStatus, type RenderPreset } from "@/lib/studio/render";
import { renderToDrive } from "@/lib/studio/renderToDrive";
import { usePendingDeleteStore } from "@/stores/drive/pendingDeleteStore";
import { trashName } from "@/lib/studio/videoActions";
import { setCaptions, type VideoDetail } from "@/lib/studio/videos";
import { useTabStore } from "@/stores/shell/tabStore";
import { useNarrateStore } from "@/stores/studio/narrateStore";
import { useRenderStore } from "@/stores/studio/renderStore";
import { useVideosStore } from "@/stores/studio/videosStore";

const REVEAL = isWindows ? "Show in Explorer" : "Show in Finder";
const TRASH = `Move to ${trashName(isWindows)}`;
const SHOW_IN_DRIVE = "Show in Drive";

/**
 * The video page's Export menu: each preset with whether its file is there
 * and current, Render for one that is missing or out of date (the render bar
 * beside the button shows its progress), and Show in Finder and Move to Trash
 * for a file there. Final and Small go into Drive (`renderToDrive`): the
 * first Render asks where, and a row in Drive shows where it is as one quiet
 * trail line, with Show in Drive. The statuses are the row's (`useExportStatus`), read
 * again when the menu opens and after a file is moved to the Trash. While a
 * render or a narration of the video runs, nothing here starts or moves one.
 * Under the presets, the switch for captions drawn into the picture, which
 * makes the files already there out of date; `onChanged` re-reads the video.
 */
export function ExportMenu({ detail, onChanged }: { detail: VideoDetail; onChanged: () => void }) {
  const { dir, slug } = detail.row;
  const [open, setOpen] = useState(false);
  const { rows, error: readError } = useExportStatus(dir);
  const [error, setError] = useState<string | null>(null);
  const active = useRenderStore((s) => s.active[dir]);
  const narrating = useNarrateStore((s) => dir in s.active);
  const load = () => reloadExportStatus(dir);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) load();
  };

  const [saving, setSaving] = useState(false);
  const [captionsError, setCaptionsError] = useState<string | null>(null);
  const toggleCaptions = async (on: boolean) => {
    setSaving(true);
    setCaptionsError(null);
    try {
      await setCaptions(slug, on);
      onChanged();
      load();
    } catch (e) {
      setCaptionsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const render = (preset: RenderPreset) => {
    setOpen(false);
    void renderToDrive(dir, slug, preset);
  };

  // No confirm: the render, and a Drive copy still this export, go to the
  // Trash as one delete the Undo toast offers. The page then plays the
  // render left, or offers Render draft; an Undo announces the Drive copy,
  // and the menu reads its statuses again when it next opens.
  const [removing, setRemoving] = useState<RenderPreset | null>(null);
  const remove = async (preset: RenderPreset) => {
    setRemoving(preset);
    setError(null);
    try {
      usePendingDeleteStore.getState().show(await deleteRender(slug, preset));
      onChanged();
      void useVideosStore.getState().reload();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" className="gap-1.5">
          Export
          <CaretDown size={11} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5" data-undo-delete>
        {(error ?? readError) && (
          <p className="px-2 py-1.5 text-[12px] leading-snug text-destructive">{error ?? readError}</p>
        )}
        {!rows && !readError && <p className="px-2 py-1.5 text-[12px] text-muted-foreground">Checking the exports…</p>}
        {rows?.map((row) => (
          <ExportRow
            key={row.preset}
            row={row}
            hint={presetHint(row.preset, detail.width, detail.height)}
            title={detail.row.title}
            rendering={active ? active.preset === row.preset : false}
            busy={!!active || narrating || removing != null}
            onRender={() => render(row.preset)}
            onRemove={() => void remove(row.preset)}
          />
        ))}
        <div className="mt-1 border-t border-border-subtle px-2 pb-1 pt-2.5">
          <div className="flex items-center gap-3">
            <label htmlFor={`captions-${slug}`} className="min-w-0 flex-1 cursor-pointer">
              <div className="text-[13px] font-medium">Captions in the picture</div>
              <div className="text-[11.5px] leading-snug text-muted-foreground">
                Drawn into the frames, so every player shows them
              </div>
            </label>
            <Switch
              id={`captions-${slug}`}
              checked={detail.captions}
              disabled={saving}
              onCheckedChange={(on) => void toggleCaptions(on)}
              className="shrink-0"
            />
          </div>
          {captionsError && <p className="mt-1 text-[12px] leading-snug text-destructive">{captionsError}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExportRow({
  row,
  hint,
  title,
  rendering,
  busy,
  onRender,
  onRemove,
}: {
  row: ExportStatus;
  hint: string;
  /** The video's title, which a first export is named after. */
  title: string;
  rendering: boolean;
  /** A render or a narration of the folder runs, or a file is being moved
   *  to the Trash. */
  busy: boolean;
  onRender: () => void;
  onRemove: () => void;
}) {
  const state = menuState(row);
  const path = row.path;
  const drive = row.drive;
  return (
    <div className="rounded-lg px-2 py-1.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13px]">
            <span className="font-medium">{PRESET_LABEL[row.preset]}</span>
            {state === "current" && <CheckCircle size={13} weight="fill" className="shrink-0 text-brand" />}
            {state === "stale" && <span className="text-[11px] font-medium text-warning">Out of date</span>}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">{hint}</div>
          {state === "blocked" && (
            <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{row.problem}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {drive && (
            <Button
              variant="ghost"
              size="icon-xs"
              title={SHOW_IN_DRIVE}
              aria-label={SHOW_IN_DRIVE}
              onClick={() => useTabStore.getState().addTab(driveFolderHref(parentRel(drive.rel)))}
            >
              <ArrowSquareUpRight />
            </Button>
          )}
          {path && (
            <Button
              variant="ghost"
              size="icon-xs"
              title={REVEAL}
              aria-label={REVEAL}
              onClick={() => revealItemInDir(path).catch((e) => console.error("reveal failed", e))}
            >
              <FolderOpen />
            </Button>
          )}
          {path && (
            <Button variant="ghost" size="icon-xs" title={TRASH} aria-label={TRASH} disabled={busy} onClick={onRemove}>
              <Trash />
            </Button>
          )}
          {rendering ? (
            <span className="flex h-6 items-center px-1 text-muted-foreground">
              <CircleNotch size={13} className="animate-spin" />
            </span>
          ) : (
            state !== "current" &&
            state !== "blocked" && (
              <Button variant="outline" size="xs" disabled={busy} onClick={onRender}>
                {state === "stale" ? "Re-render" : "Render"}
              </Button>
            )
          )}
        </div>
      </div>
      {drive && <DriveLine file={drive} named={suggestedName(title, row.preset)} />}
    </div>
  );
}

/** Where a render is in Drive, from its subject (or My Drive): its folder,
 *  and its own name once the student has renamed it. */
function DriveLine({ file, named }: { file: DriveFile; named: string }) {
  const { subjects } = useSubjects();
  const renamed = baseName(file.rel) !== named;
  const parts = driveTrail(renamed ? file.rel : parentRel(file.rel), subjects, "subject");
  return (
    <Trail
      quiet
      crumbs={driveTrailCrumbs(parts, { size: 11, folders: false })}
      className="mt-0.5 text-[11.5px] leading-snug"
    />
  );
}
