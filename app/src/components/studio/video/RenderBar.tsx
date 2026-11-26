import { Warning } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PillTabs } from "@/components/ui/table/PillTabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useExportStatus } from "@/hooks/studio/useExportStatus";
import type { NarrationRead } from "@/hooks/studio/useNarrationStatus";
import type { VideoPlayback } from "@/hooks/studio/useVideoPlayback";
import { fmtAgo } from "@/lib/format/format";
import { exportState, PRESET_LABEL } from "@/lib/studio/exports";
import { narrateBlocker, narrateHint, narratingLabel, renderNote, renderNoteWords } from "@/lib/studio/videoControls";
import type { VideoDetail } from "@/lib/studio/videos";
import { useNarrateStore } from "@/stores/studio/narrateStore";
import { useRenderStore } from "@/stores/studio/renderStore";

/**
 * In the row under the player, before Export: which render it shows (pills
 * when there are several), when that was made and, as a warning, whether it
 * is out of date, with Re-render for a stale file or Narrate when the
 * narration no longer covers the script or is in another voice, each the
 * size of Export beside it. This Narrate is the page's one way to narrate. A render or a narration in flight takes its place with
 * its bar and Cancel.
 */
export function RenderBar({
  detail,
  playback,
  narration,
  running,
}: {
  detail: VideoDetail;
  playback: VideoPlayback;
  narration: NarrationRead;
  /** The video's thread is running a turn. */
  running: boolean;
}) {
  const { dir, slug } = detail.row;
  const active = useRenderStore((s) => s.active[dir]);
  const cancelRender = useRenderStore((s) => s.cancel);
  const startRender = useRenderStore((s) => s.start);
  const narrating = useNarrateStore((s) => s.active[dir]);
  const cancelNarration = useNarrateStore((s) => s.cancel);
  const { rows } = useExportStatus(dir);
  const { shown, playable } = playback;
  const presets = playable.map((r) => r.preset);

  if (narrating) {
    const pct = narrating.of > 0 ? Math.round((narrating.done / narrating.of) * 100) : null;
    return <InFlight label={narratingLabel(narrating)} pct={pct} onCancel={() => cancelNarration(dir, slug)} />;
  }

  if (active) {
    const pct = active.fraction == null ? null : Math.round(active.fraction * 100);
    const label =
      active.phase === "muxing"
        ? "Adding the narration"
        : `Rendering ${PRESET_LABEL[active.preset].toLowerCase()}${active.phase === "planning" ? "…" : ""}`;
    return <InFlight label={label} pct={pct} onCancel={() => cancelRender(dir)} />;
  }

  const status = shown ? rows?.find((r) => r.preset === shown.preset) : undefined;
  const note = renderNote({
    timingProblem: detail.timingProblem,
    narration: narration.status,
    narrated: detail.row.narrated,
    running,
    state: status ? exportState(status) : null,
  });
  const narrate = note === "narration" || note === "unnarrated";
  if (!shown && !narrate) return null;
  const { made, flag } = renderNoteWords({
    note,
    preset: shown && presets.length <= 1 ? PRESET_LABEL[shown.preset] : null,
    ago: shown ? fmtAgo(shown.modified * 1000) : null,
  });

  return (
    <div className="flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
      {shown && presets.length > 1 && (
        <PillTabs
          tabs={presets.map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
          value={shown.preset}
          onChange={playback.pick}
        />
      )}
      {made && <span className="truncate tabular-nums">{made}</span>}
      {flag && (
        <span className="flex shrink-0 items-center gap-1 font-medium text-warning">
          <Warning size={12} weight="fill" className="shrink-0" />
          {flag}
        </span>
      )}
      {note === "stale" && shown && (
        <Button variant="outline" size="sm" onClick={() => void startRender(dir, slug, shown.preset)}>
          Re-render
        </Button>
      )}
      {narrate && <NarrateButton dir={dir} slug={slug} narration={narration} running={running} />}
    </div>
  );
}

/** A render or a narration in flight: what it is doing, its bar and Cancel. */
function InFlight({ label, pct, onCancel }: { label: string; pct: number | null; onCancel: () => void }) {
  return (
    <div className="flex w-72 max-w-full min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted-foreground">
          <span className="tabular-nums">{label}</span>
          {pct != null && <span className="tabular-nums">{pct}%</span>}
        </div>
        <Progress value={pct ?? 0} className="h-1" />
      </div>
      <Button variant="outline" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

/** Narrates what the script no longer has clips for, saying how many scenes
 *  in its tooltip. Off while the thread's turn or a render runs or narration
 *  cannot run now, with that reason as the tooltip instead. */
function NarrateButton({
  dir,
  slug,
  narration,
  running,
}: {
  dir: string;
  slug: string;
  narration: NarrationRead;
  running: boolean;
}) {
  const start = useNarrateStore((s) => s.start);
  const rendering = useRenderStore((s) => dir in s.active);
  const { status, error } = narration;
  const blocker = narrateBlocker({ rendering, running, problem: status?.problem ?? error });
  const tip = blocker ?? narrateHint(status);
  const button = (
    <Button variant="outline" size="sm" disabled={blocker != null || !status} onClick={() => void start(dir, slug)}>
      Narrate
    </Button>
  );
  if (!tip) return button;
  return (
    <Tooltip>
      {/* A disabled button takes no pointer events, so its wrapper holds the tooltip. */}
      <TooltipTrigger asChild>
        <span
          tabIndex={blocker ? 0 : undefined}
          className="inline-flex rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Why the last render of this video failed, until the next one starts. */
export function RenderError({ dir }: { dir: string }) {
  const error = useRenderStore((s) => s.errors[dir]);
  return error ? <p className="text-[12px] leading-snug text-destructive">{error}</p> : null;
}

/** Why the last narration of this video failed, until the next one starts. */
export function NarrateError({ dir }: { dir: string }) {
  const error = useNarrateStore((s) => s.errors[dir]);
  return error ? <p className="text-[12px] leading-snug text-destructive">{error}</p> : null;
}
