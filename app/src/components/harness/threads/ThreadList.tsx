import { memo, useCallback, useMemo, useState } from "react";
import { ResizeHandle } from "@/components/ui/layout/ResizeHandle";
import { SideNav } from "@/components/ui/layout/SideNav";
import { chatHref, type HarnessThread } from "@/lib/harness";
import type { Subject } from "@/lib/db";
import type { ChatScope } from "@/lib/harness/scope";
import { useCollapsedGroups } from "@/hooks/shell/useCollapsedGroups";
import type { useResizablePanel } from "@/hooks/gestures/useResizablePanel";
import { useStoredState } from "@/hooks/ui/useStoredState";
import { useTabStore } from "@/stores/shell/tabStore";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { draftKey, hasDraft, useDraftStore } from "@/stores/chat/draftStore";
import { DeleteThreadDialog } from "./DeleteThreadDialog";
import { DraftRows } from "./list/DraftRows";
import { ThreadRow } from "./ThreadRow";
import { useThreadPreviews } from "./useThreadPreviews";
import { COLLAPSED_KEY, VIEW_KEY } from "./order";
import { ListHeader, readThreadView } from "./list/Header";
import { RecentsBody } from "./list/RecentsBody";
import { SubjectBody } from "./list/SubjectBody";
import { SearchResults } from "./search/SearchResults";
import { useThreadSearch } from "./search/useThreadSearch";

export { THREAD_LIST_PANEL } from "./order";

/**
 * Chat's nav column on `SideNav`, the subject page's column: search and new
 * chat on top, the view switch under them, then the threads as Recents
 * (newest first) or by Subject, remembered per device; typing a search
 * swaps the view for results. It takes its width and fold from
 * `panel` (`ChatPage` owns it); ⌘⌥B or the page header's toggle folds it
 * away completely. Titles come from `Harness::name_thread`.
 */
const openInNewTab = (t: HarnessThread) => useTabStore.getState().addTab(chatHref(t.id, t.title));
const showMore = () =>
  void useHarnessStore.getState().showMoreThreads().catch((e) => console.error("thread list read failed", e));

export const ThreadList = memo(function ThreadList({
  panel,
  threads,
  subjects,
  activeId,
  activeDraft,
  runningIds,
  onOpen,
  onOpenDraft,
  onDiscardDraft,
  onNew,
  onDelete,
}: {
  panel: ReturnType<typeof useResizablePanel>;
  threads: HarnessThread[];
  subjects: Subject[];
  activeId: number | null;
  /** The new chat this tab is writing (`chatHref`'s `d`). */
  activeDraft: string | null;
  onOpenDraft: (id: string) => void;
  onDiscardDraft: (id: string) => void;
  /** Ids, not the store's live map, which changes on every streamed token. */
  runningIds: Set<number>;
  onOpen: (id: number) => void;
  /** No argument: the new chat asks for its scope; otherwise that group's. */
  onNew: (scope?: ChatScope) => void;
  /** `attachments`: the chat's own files to delete after it (`DeleteThreadDialog`). */
  onDelete: (id: number, attachments: string[]) => void;
}) {
  const { collapsed } = panel;
  const [view, setView] = useStoredState(VIEW_KEY, readThreadView);
  const [deleting, setDeleting] = useState<HarnessThread | null>(null);
  const [query, setQuery] = useState("");
  const found = useThreadSearch(query);
  const more = useHarnessStore((s) => s.moreThreads);
  // The Subject view's folded groups — not the column's own `collapsed`.
  const { folded, setOpen } = useCollapsedGroups(COLLAPSED_KEY);
  const newChat = useCallback(() => onNew(), [onNew]);
  const lines = useThreadPreviews(threads);
  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  // Threads with unsent words, as a string so typing re-renders nothing here.
  const draftedKey = useDraftStore((s) =>
    threads
      .filter((t) => hasDraft(s, draftKey(t.id, "chat")))
      .map((t) => t.id)
      .join(","),
  );
  const drafted = useMemo(() => new Set(draftedKey ? draftedKey.split(",").map(Number) : []), [draftedKey]);

  // A search hit may be older than the threads read: list it first, so the
  // page finds it at once.
  const openThread = useCallback(
    (t: HarnessThread) => {
      useHarnessStore.getState().keep(t);
      onOpen(t.id);
    },
    [onOpen],
  );

  const row = (showSubject: boolean) => (t: HarnessThread) => (
    <ThreadRow
      key={t.id}
      thread={t}
      subject={t.subject_id == null ? undefined : bySubject.get(t.subject_id)}
      showSubject={showSubject}
      preview={lines.messages.get(t.id)}
      question={lines.questions.get(t.id)}
      active={t.id === activeId}
      running={runningIds.has(t.id)}
      drafted={drafted.has(t.id)}
      onOpen={onOpen}
      onNewTab={openInNewTab}
      onAskDelete={setDeleting}
    />
  );

  return (
    <>
      <SideNav
        aria-label="Conversations"
        width={panel.width}
        collapsed={collapsed}
        animate={!panel.dragging}
        header={
          <ListHeader
            view={view}
            onView={setView}
            query={query}
            onQuery={setQuery}
            onSearchEnter={() => found?.results[0] && openThread(found.results[0])}
            onNew={newChat}
            collapsed={collapsed}
          />
        }
      >
        {!found && (
          <DraftRows subjects={subjects} activeDraft={activeDraft} onOpen={onOpenDraft} onDiscard={onDiscardDraft} />
        )}
        {found ? (
          <SearchResults found={found} activeId={activeId} onOpen={openThread} />
        ) : view === "recents" ? (
          <RecentsBody threads={threads} more={more} onMore={showMore} row={row(true)} />
        ) : (
          <SubjectBody
            threads={threads}
            subjects={subjects}
            activeId={activeId}
            runningIds={runningIds}
            folded={folded}
            onGroupOpen={setOpen}
            collapsed={collapsed}
            onNew={onNew}
            more={more}
            onMore={showMore}
            row={row(false)}
          />
        )}
      </SideNav>
      {/* On the seam: negative margins cost no layout width. Folded away the
          seam is the page's own left edge, where a side panel's handle lives. */}
      {!collapsed && (
        <ResizeHandle
          onMouseDown={panel.onMouseDown}
          dragging={panel.dragging}
          label="Resize conversations"
          className="-mx-0.5"
        />
      )}
      <DeleteThreadDialog
        thread={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={(t, attachments) => {
          onDelete(t.id, attachments);
          setDeleting(null);
        }}
      />
    </>
  );
});
