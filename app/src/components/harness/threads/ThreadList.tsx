import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ResizeHandle } from "@/components/ui/layout/ResizeHandle";
import { SideNav } from "@/components/ui/layout/SideNav";
import { chatHref, childAttention, type HarnessThread } from "@/lib/harness";
import { nestChildren } from "@/lib/harness/children";
import type { Subject } from "@/lib/db";
import type { ChatScope } from "@/lib/harness/scope";
import { useCollapsedGroups } from "@/hooks/shell/useCollapsedGroups";
import type { useSideNavPanel } from "@/hooks/ui/useSideNavPanel";
import { useStoredSet, useStoredState } from "@/hooks/ui/useStoredState";
import { useTabStore } from "@/stores/shell/tabStore";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { draftKey, hasDraft, newChatKey, useDraftStore } from "@/stores/chat/draftStore";
import { DeleteThreadDialog } from "./DeleteThreadDialog";
import { DraftRows } from "./list/DraftRows";
import { useLeftDraft } from "./list/useLeftDraft";
import { ChildRows } from "./list/ChildRows";
import { threadRowStatus } from "./StatusPill";
import { ThreadRow } from "./ThreadRow";
import { useThreadPreviews } from "./useThreadPreviews";
import { CHILDREN_OPEN_KEY, COLLAPSED_KEY, VIEW_KEY } from "./order";
import { ListHeader, readThreadView } from "./list/Header";
import { byNewest, RecentsBody } from "./list/RecentsBody";
import { SubjectBody } from "./list/SubjectBody";
import { SearchResults } from "./search/SearchResults";
import { useThreadSearch } from "./search/useThreadSearch";

export { THREAD_LIST_PANEL } from "./order";

/**
 * Chat's nav column on `SideNav`, the subject page's column: search and new
 * chat on top, the view switch under them, then the threads as Recents
 * (newest first) or by Subject, remembered per device; typing a search
 * swaps the view for results. A subagent's chat is listed under its parent
 * in a fold (`ChildRows`), remembered open per device, never at the top
 * level. It takes its width and fold from
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
  panel: ReturnType<typeof useSideNavPanel>;
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
  // Children leave the top level for their parent's fold, shut until opened.
  // Newest first, so each fold lists its children as Recents lists chats.
  const nest = useMemo(() => nestChildren(byNewest(threads)), [threads]);
  const [kidsOpen, setKidsOpen] = useStoredSet(CHILDREN_OPEN_KEY);
  const toggleKids = useCallback(
    (parent: number, open: boolean) =>
      setKidsOpen((prev) => {
        const key = String(parent);
        if (open === prev.has(key)) return prev;
        const next = new Set(prev);
        if (open) next.add(key);
        else next.delete(key);
        return next;
      }),
    [setKidsOpen],
  );
  // The open chat's parent, when it is a child: its fold opens so the row shows.
  const activeParent = useMemo(() => {
    if (activeId == null) return null;
    for (const [parent, kids] of nest.children) if (kids.some((k) => k.id === activeId)) return parent;
    return null;
  }, [nest, activeId]);
  useEffect(() => {
    if (activeParent != null) toggleKids(activeParent, true);
  }, [activeParent, toggleKids]);
  // A Subject group's working ring and its paging count a family as its parent.
  const familyRunning = useMemo(() => {
    const busy = new Set(runningIds);
    for (const [parent, kids] of nest.children) if (kids.some((k) => runningIds.has(k.id))) busy.add(parent);
    return busy;
  }, [nest, runningIds]);
  const newChat = useCallback(() => onNew(), [onNew]);
  const lines = useThreadPreviews(threads);
  const bySubject = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  // The composer this tab has open shows its draft only once the tab has left it.
  const openListed = useLeftDraft(
    activeDraft != null ? newChatKey(activeDraft) : activeId != null ? draftKey(activeId, "chat") : null,
  );
  // Threads with unsent words, as a string so typing re-renders nothing here.
  const draftedKey = useDraftStore((s) =>
    threads
      .filter((t) => (t.id === activeId ? openListed : hasDraft(s, draftKey(t.id, "chat"))))
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

  const threadRow = (t: HarnessThread, showSubject: boolean, childStatus?: ReturnType<typeof childAttention>) => (
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
      childStatus={childStatus}
      onOpen={onOpen}
      onNewTab={openInNewTab}
      onAskDelete={setDeleting}
    />
  );
  // A child row drops its subject line: it shares its parent's.
  const childRow = (t: HarnessThread) => threadRow(t, false);
  const row = (showSubject: boolean) => (t: HarnessThread) => {
    const kids = nest.children.get(t.id) ?? [];
    const open = kidsOpen.has(String(t.id));
    // Folded, the parent shows what its children most need.
    const bubbled = open ? null : childAttention(kids.map((k) => threadRowStatus(k, runningIds.has(k.id))));
    return (
      <div key={t.id} className="flex flex-col">
        {threadRow(t, showSubject, bubbled)}
        <ChildRows
          parentTitle={t.title?.trim() || "Untitled"}
          kids={kids}
          open={open}
          onToggle={(next) => toggleKids(t.id, next)}
          row={childRow}
        />
      </div>
    );
  };

  return (
    <>
      <SideNav
        aria-label="Conversations"
        width={panel.width}
        collapsed={collapsed}
        animate={panel.animate}
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
          <DraftRows
            subjects={subjects}
            activeDraft={activeDraft}
            activeListed={openListed}
            onOpen={onOpenDraft}
            onDiscard={onDiscardDraft}
          />
        )}
        {found ? (
          <SearchResults found={found} activeId={activeId} onOpen={openThread} />
        ) : view === "recents" ? (
          <RecentsBody threads={nest.top} more={more} onMore={showMore} row={row(true)} />
        ) : (
          <SubjectBody
            threads={nest.top}
            subjects={subjects}
            activeId={activeParent ?? activeId}
            runningIds={familyRunning}
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
