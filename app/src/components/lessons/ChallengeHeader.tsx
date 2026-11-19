import { useEffect, useRef, useState } from "react";
import { ArrowSquareOut, ArrowsClockwise, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/table/PillTabs";
import { openLinkOut } from "@/lib/files/canvasLinks";
import { resyncSummary, type WorkspaceResync } from "@/lib/ed/workspace";
import { cn } from "@/lib/utils";

/** What a challenge slide shows: its brief or its workspace's files. */
export type ChallengeView = "description" | "workspace";

const VIEWS = [
  { value: "description", label: "Description" },
  { value: "workspace", label: "Workspace" },
] as const;

/** How long a resync's outcome stays before it fades, and the fade. */
const SHOWN_MS = 4000;
const FADE_MS = 400;

type Outcome = { failed: boolean; text: string };

/** The strip over a challenge slide: Description | Workspace, as Ed has them,
 *  and Open in Ed, where the challenge is run, edited and marked, the files
 *  here being a read-only copy of the student's workspace. An in-app tab;
 *  ⌘-click opens the system browser. With Workspace shown, Resync fetches
 *  that copy again, its outcome a quiet line beside it. */
export function ChallengeHeader({
  view,
  onView,
  edUrl,
  onResync,
}: {
  view: ChallengeView;
  onView: (view: ChallengeView) => void;
  edUrl: string | null;
  /** Fetch the workspace from Ed now; absent when the slide has no challenge
   *  or no `.md` to mirror beside. */
  onResync?: () => Promise<WorkspaceResync>;
}) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [fading, setFading] = useState(false);
  const live = useRef(true);
  // Set again on mount: StrictMode's mount, unmount, mount would leave it false.
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  // A success says itself and fades; an error stays until the next resync.
  useEffect(() => {
    if (!outcome || outcome.failed) return;
    const fade = setTimeout(() => setFading(true), SHOWN_MS);
    const clear = setTimeout(() => setOutcome(null), SHOWN_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(clear);
    };
  }, [outcome]);

  const resync = async () => {
    if (!onResync) return;
    setRunning(true);
    setOutcome(null);
    setFading(false);
    try {
      const result = await onResync();
      if (live.current) setOutcome({ failed: false, text: resyncSummary(result) });
    } catch (e) {
      if (live.current) setOutcome({ failed: true, text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (live.current) setRunning(false);
    }
  };

  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-3">
      <PillTabs tabs={VIEWS} value={view} onChange={onView} />
      <div className="flex min-w-0 items-center gap-2">
        {view === "workspace" && outcome && (
          <span
            title={outcome.text}
            style={{ transitionDuration: `${FADE_MS}ms` }}
            className={cn(
              "min-w-0 truncate text-xs transition-opacity will-change-[opacity] tabular-nums",
              outcome.failed ? "text-destructive/80" : "text-muted-foreground",
              fading && "opacity-0",
            )}
          >
            {outcome.text}
          </span>
        )}
        {view === "workspace" && onResync && (
          <Button size="xs" variant="secondary" className="shrink-0" disabled={running} onClick={() => void resync()}>
            {running ? <CircleNotch className="animate-spin" /> : <ArrowsClockwise />}
            Resync
          </Button>
        )}
        {edUrl && (
          <Button size="xs" variant="secondary" className="shrink-0" onClick={(e) => void openLinkOut(edUrl, e.metaKey)}>
            <ArrowSquareOut />
            Open in Ed
          </Button>
        )}
      </div>
    </div>
  );
}
