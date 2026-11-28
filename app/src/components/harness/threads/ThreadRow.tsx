import { memo } from "react";
import { NotePencil, VideoCamera } from "@phosphor-icons/react";
import { ProviderMark } from "@/components/icons/ProviderMark";
import { SIDE_NAV_FOLDS } from "@/components/ui/layout/SideNav";
import { sqliteUtcToMs } from "@/lib/format/format";
import { shortAge } from "@/lib/activity/recents";
import { chatHref, PROVIDERS, withChildren, type HarnessThread, type ThreadStatus } from "@/lib/harness";
import { activityLine } from "@/lib/harness/activity";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { cn } from "@/lib/utils";
import { VideoGlyph } from "./parts";
import { PreviewLine } from "./PreviewLine";
import { RowMenu } from "./RowMenu";
import { DRAFT_MARK, DRAFT_TINT } from "./list/DraftRows";
import {
  HIDDEN_UNDER_ACTIONS,
  ROW_ACTIONS,
  ROW_PREVIEW,
  ROW_TITLE,
  TITLE_ATTENTION,
  TITLE_READ,
  TITLE_READ_ACTIVE,
  UNDER_ACTIONS,
} from "./rowType";
import { ATTENTION, runStartedMs, STATUS_LOOK, StatusPill, threadRowStatus } from "./StatusPill";

/**
 * A thread as two lines under its subject group's header: its title with its
 * status or age at the right, then its newest message (`PreviewLine`) and
 * provider mark. A title is bright and medium while the thread wants the student
 * (`ATTENTION`), dimmed otherwise (`rowType`). Hover shows the ⋯ menu on no
 * surface of its own: the line under it fades out and hides its status.
 * While the column folds, the status dot stays longest.
 */
export const ThreadRow = memo(function ThreadRow({
  thread: t,
  preview,
  question,
  active,
  running,
  drafted,
  childStatus = null,
  onOpen,
  onNewTab,
  onAskDelete,
}: {
  thread: HarnessThread;
  /** The newest message, either side's. */
  preview: string | undefined;
  /** The question it waits on, line three while it does. */
  question: string | undefined;
  active: boolean;
  running: boolean;
  /** Its composer holds unsent words: the row wears a pencil. */
  drafted: boolean;
  /** Its folded children's most urgent status (`childAttention`), shown
   *  when it outranks the row's own. */
  childStatus?: ThreadStatus | null;
  onOpen: (id: number) => void;
  onNewTab: (thread: HarnessThread) => void;
  /** Asks to delete it; the list confirms in a dialog. */
  onAskDelete: (thread: HarnessThread) => void;
}) {
  const title = t.title?.trim() || "Untitled";
  const own = threadRowStatus(t, running);
  const status = withChildren(own, childStatus);
  // A child's Working never dims the parent's own unread Done.
  const attention = (status != null && ATTENTION.has(status)) || (own != null && ATTENTION.has(own));
  const right = (
    <span className={cn("flex shrink-0", HIDDEN_UNDER_ACTIONS)}>
      <RightSlot thread={t} status={status} ownWork={own === "working"} />
    </span>
  );
  return (
    <div
      data-thread-row={t.id}
      className={cn(
        "group/thread relative rounded-lg transition-colors",
        active ? "bg-sidebar-item-active" : drafted ? DRAFT_TINT : "hover:bg-sidebar-item-hover",
      )}
    >
      {/* The whole row is the hit target; the actions are siblings, never inside it. */}
      <button
        type="button"
        // ⌘-click opens the thread in a new tab (`app/src/lib/shell/newTabClicks.ts`).
        data-tab-href={chatHref(t.id, t.title)}
        aria-current={active ? "page" : undefined}
        onClick={() => onOpen(t.id)}
        className="flex w-full min-w-0 flex-col px-2.5 pt-1.5 pb-[7px] text-left"
      >
        <span
          className={cn(
            "flex h-[21px] w-full min-w-0 items-center gap-1.5",
            ROW_TITLE,
            SIDE_NAV_FOLDS,
            UNDER_ACTIONS,
          )}
        >
          {drafted && <NotePencil size={13} className={DRAFT_MARK} aria-label="Unsent draft" />}
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              attention ? TITLE_ATTENTION : active ? TITLE_READ_ACTIVE : TITLE_READ,
            )}
          >
            {title}
          </span>
          {t.lecture_id && (
            <VideoCamera size={12} className="shrink-0 text-muted-foreground opacity-70" aria-label="Lecture thread" />
          )}
          <VideoGlyph threadId={t.id} size={12} className="opacity-70" />
          {right}
        </span>
        <span className={cn("flex h-[18px] w-full min-w-0 items-center gap-1.5", ROW_PREVIEW, SIDE_NAV_FOLDS)}>
          <span className="min-w-0 flex-1 truncate">
            {own === "working" ? (
              <LiveLine threadId={t.id} fallback={preview} />
            ) : (
              <PreviewLine text={(own === "input" && question) || preview || ""} />
            )}
          </span>
          <span title={PROVIDERS.find((p) => p.id === t.provider)?.label} className="flex shrink-0">
            <ProviderMark provider={t.provider} className="size-[13px]" />
          </span>
        </span>
        {status && <FoldDot status={status} className="top-3 left-1" />}
      </button>
      <div
        className={cn(
          "absolute top-1 right-1.5 flex items-center",
          SIDE_NAV_FOLDS,
          "group-data-[collapsed=true]/nav:pointer-events-none",
        )}
      >
        <div
          data-row-actions
          className={cn("flex items-center gap-px", ROW_ACTIONS)}
        >
          <RowMenu title={title} onNewTab={() => onNewTab(t)} onDelete={() => onAskDelete(t)} />
        </div>
      </div>
    </div>
  );
});

/** The status in its tone, or the thread's age when it has none. */
function RightSlot({ thread, status, ownWork }: { thread: HarnessThread; status: ThreadStatus | null; ownWork: boolean }) {
  // A child's Working has no timer here: the run is the child's.
  if (status) return <StatusPill status={status} since={status === "working" && ownWork ? runStartedMs(thread) : null} />;
  const ms = sqliteUtcToMs(thread.updated_at);
  return ms == null ? null : (
    <span className="h-5 shrink-0 text-[11.5px] leading-5 tabular-nums text-muted-foreground">{shortAge(ms)}</span>
  );
}

/** What a working run does now, if a view holds its rows; else `fallback`.
 *  The selector returns a string, so streamed tokens re-render nothing. */
function LiveLine({ threadId, fallback }: { threadId: number; fallback: string | undefined }) {
  const line = useHarnessStore((s) => activityLine(s.items[threadId]));
  return line ?? <PreviewLine text={fallback ?? ""} />;
}

/** The status in a dot, shown only while the column folds away. */
function FoldDot({ status, className }: { status: ThreadStatus; className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute size-1.5 rounded-full opacity-0 transition-opacity will-change-[opacity] duration-150 group-data-[collapsed=true]/nav:opacity-100",
        STATUS_LOOK[status].dot,
        className,
      )}
    />
  );
}
