import { ArrowSquareOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { PillTabs } from "@/components/ui/table/PillTabs";
import { openLinkOut } from "@/lib/files/canvasLinks";

/** What a challenge slide shows: its brief or its workspace's files. */
export type ChallengeView = "description" | "workspace";

const VIEWS = [
  { value: "description", label: "Description" },
  { value: "workspace", label: "Workspace" },
] as const;

/** The strip over a challenge slide: Description | Workspace, as Ed has them,
 *  and Open in Ed, where the challenge is run, edited and marked, the files
 *  here being a read-only copy of the student's workspace. An in-app tab;
 *  ⌘-click opens the system browser. */
export function ChallengeHeader({
  view,
  onView,
  edUrl,
}: {
  view: ChallengeView;
  onView: (view: ChallengeView) => void;
  edUrl: string | null;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-3">
      <PillTabs tabs={VIEWS} value={view} onChange={onView} />
      {edUrl && (
        <Button size="xs" variant="secondary" onClick={(e) => void openLinkOut(edUrl, e.metaKey)}>
          <ArrowSquareOut />
          Open in Ed
        </Button>
      )}
    </div>
  );
}
