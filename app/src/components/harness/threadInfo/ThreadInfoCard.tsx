import { useLayoutEffect, useMemo, useRef } from "react";
import type { Subject } from "@/lib/db";
import type { HarnessItem, HarnessThread, Provider, ThreadUsage } from "@/lib/harness";
import { deriveThreadInfo, type InfoEntry } from "@/lib/harness/threadInfo";
import { cn } from "@/lib/utils";
import { AgentsGroup, ParentRow } from "./AgentRows";
import { EntryRow } from "./EntryRow";
import { InfoGroup } from "./InfoRow";
import { CARD_WIDTH } from "./layout";
import { ThreadRows } from "./ThreadRows";
import { useLectureFolder, useLectureTitles } from "./useLectureTitles";
import { WorkRows } from "./WorkRows";
import { recordingOf } from "@/lib/files/libraryLayout";

export interface ThreadInfoProps {
  thread: HarnessThread;
  items: HarnessItem[];
  subjects: Subject[];
  provider: Provider;
  model: string | null;
  effort: string | null;
  usage: ThreadUsage | null;
}

/**
 * Thread info's body: the chat a subagent came from, its subject, model and
 * context (unheaded), then its subagents (Agents), Read, and Made (leading
 * with what the thread is making from Work kinds, followed by written files).
 * Every row opens its thing beside the chat; nothing here makes a model call.
 * The same card floats in the chat pane or fills the header button's popover.
 */
export function ThreadInfoCard({
  thread,
  items,
  subjects,
  provider,
  model,
  effort,
  usage,
  onHeight,
  onOpened,
  className,
}: ThreadInfoProps & {
  /** Its drawn height, for `threadInfoFloats`. */
  onHeight: (height: number) => void;
  onOpened?: () => void;
  className?: string;
}) {
  const lectureFolder = useLectureFolder(thread.lecture_id);
  const { read, made } = useMemo(
    () => deriveThreadInfo(items, { threadId: thread.id, lectureFolder }),
    [items, thread.id, lectureFolder],
  );
  const lectureFolders = useMemo(
    () =>
      read.flatMap((e) => {
        return recordingOf(e.key) === e.key ? [e.key] : [];
      }),
    [read],
  );
  const lectureTitle = useLectureTitles(lectureFolders);

  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => onHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  const entry = (e: InfoEntry) => <EntryRow key={e.key} entry={e} lectureTitle={lectureTitle} onOpened={onOpened} />;
  return (
    <div
      ref={box}
      aria-label="Thread info"
      role="region"
      tabIndex={-1}
      style={{ width: CARD_WIDTH }}
      className={cn(
        "flex flex-col rounded-2xl border border-border-subtle bg-popover outline-none p-1.5 text-popover-foreground shadow-lg",
        className,
      )}
    >
      <div className="flex flex-col pb-1">
        {thread.parent_id != null && <ParentRow parentId={thread.parent_id} onOpened={onOpened} />}
        <ThreadRows
          thread={thread}
          subjects={subjects}
          provider={provider}
          model={model}
          effort={effort}
          usage={usage}
          onOpened={onOpened}
        />
      </div>
      <AgentsGroup thread={thread} onOpened={onOpened} />
      <InfoGroup heading="Read" rows={read} render={entry} />
      <InfoGroup heading="Made" rows={made} render={entry} leading={<WorkRows thread={thread} onOpened={onOpened} />} />
    </div>
  );
}
