import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Composer } from "@/components/harness/composer/Composer";
import { DraftHero } from "@/components/harness/composer/DraftHero";
import { NewThreadDialog } from "@/components/harness/threads/NewThreadDialog";
import { RecentThreads } from "@/components/harness/threads/RecentThreads";
import { THREAD_LIST_PANEL, ThreadList } from "@/components/harness/threads/ThreadList";
import { ThreadMap } from "@/components/harness/timeline/ThreadMap";
import { JumpToLatest } from "@/components/harness/timeline/JumpToLatest";
import { Timeline } from "@/components/harness/timeline/Timeline";
import { ThreadInfoButton } from "@/components/harness/threadInfo/ThreadInfoButton";
import { ThreadInfoCard, type ThreadInfoProps } from "@/components/harness/threadInfo/ThreadInfoCard";
import { GAP, PAD, RAIL, RESERVE } from "@/components/harness/threadInfo/layout";
import { useThreadInfo } from "@/components/harness/threadInfo/useThreadInfo";
import { useThreadActions } from "@/components/harness/threads/useThreadActions";
import { useComposerSelection } from "@/components/harness/threads/useComposerSelection";
import { useRouteThread } from "@/components/harness/threads/useRouteThread";
import { useTabId } from "@/components/tabs/TabContext";
import { PageHeader, PaneTitle, PaneTrail } from "@/components/tabs/PaneHeader";
import { DropOverlay } from "@/components/ui/layout/DropOverlay";
import { SideNavCollapseToggle } from "@/components/ui/layout/SideNav";
import { useSideNavPanel } from "@/hooks/ui/useSideNavPanel";
import { SideNavShell } from "@/components/ui/layout/SideNavShell";
import { useRateLimits } from "@/hooks/agents/useRateLimits";
import { useStickToBottom } from "@/hooks/ui/useStickToBottom";
import { useWarpLanding } from "@/hooks/ui/useWarpLanding";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
import { usePresence } from "@/hooks/ui/usePresence";
import {
  harnessDeleteAttachments,
  harnessDeleteThread,
  chatHref,
  chatDraftId,
  chatScope,
  chatThreadId,
  liveScope,
  parseUsage,
  scopeSubject,
  type ChatScope,
  type DeliveryMode,
} from "@/lib/harness";
import { itemsFor, useHarnessStore } from "@/stores/chat/harnessStore";
import { draftKey, newChatKey, useDraftStore } from "@/stores/chat/draftStore";
import { cn } from "@/lib/utils";
import { WARP_NAME } from "@/lib/ui/warp";

/**
 * Chat with a CLI agent running from the library's `agents/` folder
 * (`docs/harness.md`): the conversations column (`ThreadList`) beside a thread.
 * `?t=<id>` is that thread's timeline; `?d=<id>` is a new chat not yet sent
 * (bare `/chat` opens an empty one), a row above the list until it is: its
 * headline names the subject (`DraftHero`), the recent threads
 * (`RecentThreads`) below it. New thread and the headline's pill ask for the
 * subject in `NewThreadDialog`. The composer is docked at the bottom of both,
 * and a new thread's will not send until a subject or General is chosen.
 *
 * Subscribes slice by slice: `live` is written many times a second mid-turn,
 * so the streaming parts subscribe where they are drawn, not here.
 */
export default function ChatPage() {
  const store = useHarnessStore;
  const listPanel = useSideNavPanel(THREAD_LIST_PANEL);
  const navigate = useNavigate();
  const here = useLocation();
  // The conversation this tab is showing, read off this tab's own route —
  // not off the store, which every Chat tab shares (`chatHref`).
  const activeId = chatThreadId(here.search);
  // The same id for callbacks that must not be rebuilt every time it changes:
  // the composer, the timeline's question actions and the queue's edits all
  // ask "which thread" at the moment they fire.
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  // The new chat this tab is writing, while it shows no thread.
  const draftId = activeId == null ? chatDraftId(here.search) : null;
  const draftRef = useRef(draftId);
  draftRef.current = draftId;
  const threads = useHarnessStore((s) => s.threads);
  const items = useHarnessStore((s) => itemsFor(activeId, s.items));
  const subjects = useHarnessStore((s) => s.subjects);
  const subjectsLoaded = useHarnessStore((s) => s.subjectsLoaded);
  // A new thread's scope is its draft's (`draftStore`), shared by every Chat
  // tab showing that new chat; unchosen until the student or an entry point picks.
  const newKey = newChatKey(draftId ?? "");
  const storedScope = useDraftStore((s) => s.scopes[newKey]);
  const scope = subjectsLoaded ? liveScope(storedScope, subjects) : null;
  const running = useHarnessStore((s) => (activeId != null && s.live[activeId]?.running) || false);
  // Words a rewind handed back to this tab's composer — local, so a
  // rewind in one Chat tab doesn't type into every tab. `n` makes the same text
  // twice two restores.
  const [restore, setRestore] = useState<{ text: string; n: number } | null>(null);
  const handBack = useCallback(
    (text: string) => setRestore((r) => ({ text, n: (r?.n ?? 0) + 1 })),
    [],
  );
  // A primitive, so this page stays off the per-token `live` updates.
  const runningKey = useHarnessStore((s) =>
    Object.keys(s.live)
      .filter((id) => s.live[Number(id)].running)
      .join(","),
  );
  const runningIds = useMemo(
    () => new Set(runningKey ? runningKey.split(",").map(Number) : []),
    [runningKey],
  );

  const { thread, missing } = useRouteThread(activeId);
  // What the next message uses: the thread's selection (or a pick on its way
  // to Rust), else the session's for a new thread.
  const { selection, refused, switchFrom, locked } = useComposerSelection(thread);
  const activeProvider = selection.provider;
  // An open thread keeps its own scope; only a new one reads the draft's.
  const activeSubject = thread ? thread.subject_id : scope == null ? null : scopeSubject(scope);
  const usage = useMemo(() => parseUsage(thread), [thread]);
  const rateLimits = useRateLimits(activeProvider);

  useEffect(() => {
    store.getState().loadThreads();
    store.getState().loadSubjects();
  }, [store]);

  // Hold this tab's thread while it's on screen, so the lecture dock can't
  // release a timeline this tab is reading. The previous thread lends its rows
  // for the read (`hold`), so a switch never flashes an empty timeline.
  const shown = useRef<number | null>(null);
  useEffect(() => {
    if (activeId == null) {
      shown.current = null;
      return;
    }
    void store.getState().hold(activeId, shown.current);
    shown.current = activeId;
    return () => store.getState().unhold(activeId);
  }, [activeId, store]);

  // A route naming a thread that no longer exists (deleted here, in another
  // tab, or before a restore) falls back to a new thread.
  useEffect(() => {
    if (missing) navigate(chatHref(null), { replace: true });
  }, [missing, navigate]);

  // The new chat on screen is always listed, even one the list let go.
  const listed = useDraftStore((s) => draftId == null || draftId in s.newChats);
  useEffect(() => {
    if (!listed && draftId != null) useDraftStore.getState().keepNewChat(draftId);
  }, [listed, draftId]);

  // Bare `/chat` (the rail, a new tab, a fallback) names no new chat: it takes
  // an empty one, or a fresh one, so every new chat has its own draft.
  const unnamed = activeId == null && draftId == null;
  useLayoutEffect(() => {
    if (!unnamed) return;
    const id = useDraftStore.getState().emptyNewChat();
    navigate(chatHref(null, null, { draft: id, subject: chatScope(here.search) ?? undefined }), { replace: true });
  }, [unnamed, here.search, navigate]);

  const paneId = useTabId();

  // An entry point's `?s=` (a Subject group's "+") seeds the new thread's scope once;
  // the route effect below then drops it, so a re-render cannot seed again.
  const seed = activeId == null ? chatScope(here.search) : null;
  useEffect(() => {
    if (seed != null) useDraftStore.getState().setScope(newKey, seed);
  }, [seed, newKey]);

  // `tabInfo` titles a tab from its path, so the thread's name travels as
  // `?n=` (`chatHref`), updated when the title lands — but not before the
  // thread is known, or a restored tab loses its name. Replace, not push, so
  // the back arrow is unchanged.
  const tabName = thread?.title?.trim() || "";
  useEffect(() => {
    if (activeId != null && thread == null) return;
    if (activeId == null && draftId == null) return;
    const want = chatHref(activeId, tabName, { draft: draftId ?? undefined });
    if (`${here.pathname}${here.search}` !== want) navigate(want, { replace: true });
  }, [activeId, thread, tabName, here.pathname, here.search, navigate]);


  // The rail's landmarks: the questions asked, from committed rows.
  const markers = useMemo(
    () => items.filter((i) => i.kind === "user").map((i) => ({ id: i.id, text: i.content ?? "" })),
    [items],
  );

  const fresh = activeId == null;
  // Only a thread follows its bottom; the recent list is read from the top,
  // so it has a scroller of its own.
  // Borrowed rows belong to the outgoing thread; wait for this thread's
  // history before choosing its initial bottom position.
  const ownRows = items.length === 0 || items[0].thread_id === activeId;
  // One scroller for both views, so the column eases between their paddings.
  const scroll = useStickToBottom(activeId, !fresh && ownRows, running, items);
  useScrollFade(scroll.outer, "y", fresh);

  // A sent new chat is forgotten (its row, scope and words), but only once
  // this tab shows the thread: cleared first, the new-chat page drew
  // "Choose a subject" for a frame before the route moved.
  const sentDraft = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (activeId == null || sentDraft.current == null) return;
    useDraftStore.getState().dropNewChat(sentDraft.current);
    sentDraft.current = null;
  }, [activeId]);
  const { send: sendTurn, onStop, onResume, onForceStop, onProvider, onModel, onReasoning, questions, pending } = useThreadActions({
    threadId: () => activeRef.current,
    selection,
    onRestore: handBack,
    // The empty composer became this conversation; replace, it isn't a page
    // to go back to.
    onCreated: (id) => {
      sentDraft.current = draftRef.current;
      navigate(chatHref(id), { replace: true });
    },
  });
  const send = useCallback(
    (text: string, mode?: DeliveryMode) =>
      sendTurn(
        text,
        () => {
          if (activeRef.current != null) return {};
          const chosen = useDraftStore.getState().scopeFor(newKey, store.getState().subjects);
          // None chosen: the composer holds the send, and Rust refuses one anyway.
          return chosen == null ? {} : { chatScope: chosen };
        },
        mode,
      ),
    [sendTurn, store, newKey],
  );

  // Opening a thread pushes, so back walks this tab's conversations.
  const onOpen = useCallback(
    (id: number) => {
      if (id === activeRef.current) return;
      const t = store.getState().threads.find((x) => x.id === id);
      navigate(chatHref(id, t?.title));
    },
    [store, navigate],
  );
  const [choosing, setChoosing] = useState(false);
  const onChoose = useCallback(() => setChoosing(true), []);
  // Every New makes a new chat, a row of its own above the list; leaving one
  // empty drops it (`openNewChat`). A Subject group's `+` names its scope;
  // plain New asks for one.
  const onNew = useCallback(
    (subject?: ChatScope) => {
      const draft = useDraftStore.getState().openNewChat();
      navigate(chatHref(null, null, { draft, subject }));
      if (subject === undefined) setChoosing(true);
    },
    [navigate],
  );
  const onOpenDraft = useCallback(
    (draft: string) => {
      if (draft !== draftRef.current) navigate(chatHref(null, null, { draft }));
    },
    [navigate],
  );
  const onDiscardDraft = useCallback(
    (draft: string) => {
      useDraftStore.getState().dropNewChat(draft);
      if (draft === draftRef.current) navigate(chatHref(null), { replace: true });
    },
    [navigate],
  );
  const onChosen = useCallback(
    (next: ChatScope) => {
      useDraftStore.getState().setScope(newKey, next);
      setChoosing(false);
    },
    [newKey],
  );
  const composerRef = useRef<HTMLDivElement>(null);
  // The Overview's ask bar, sent from this pane, morphs into this composer.
  const warping = useWarpLanding(paneId, activeId);
  const focusComposer = useCallback(() => {
    const box = composerRef.current?.querySelector<HTMLElement>('[role="textbox"]');
    if (!box) return;
    box.focus();
    // WebKit focuses a contenteditable with the caret at its start.
    const sel = window.getSelection();
    sel?.selectAllChildren(box);
    sel?.collapseToEnd();
  }, []);
  const onDelete = useCallback(
    (id: number, attachments: string[]) => {
      harnessDeleteThread(id)
        .then(() => {
          store.getState().removed(id);
          const drafts = useDraftStore.getState();
          drafts.setDraft(draftKey(id, "chat"), "");
          drafts.setPastes(draftKey(id, "chat"), []);
          // Only once the chat's rows are gone, so Rust's recheck no longer sees them.
          if (attachments.length) return harnessDeleteAttachments(attachments).then(() => undefined);
        })
        // Never swallow: a failed delete looks exactly like a lost click.
        .catch((e) => console.error("harness delete failed", e));
    },
    [store],
  );
  const onRestored = useCallback(() => setRestore(null), []);
  // Thread info: floating in the chat area beside the column, or the header
  // button's popover when the area has no room (`threadInfo/layout.ts`).
  const info = useThreadInfo(scroll.outer);
  const infoCard: ThreadInfoProps | null = thread && {
    thread,
    items,
    subjects,
    provider: selection.provider,
    model: selection.model,
    effort: selection.effort,
    usage,
  };
  const floating = info.floating && infoCard != null;
  // Mounted through its exit, so hiding it springs out as the column eases back.
  const card = usePresence(floating);
  // The column moves left to clear the card, the rail's gutter kept. The
  // scroller always shows its scrollbar (`overflow-y: scroll`), so the
  // composer adds its width on the right to centre in the same box.
  const sides = floating ? { left: RAIL, right: RESERVE } : { left: PAD, right: PAD };
  const scrollPad = { paddingLeft: sides.left, paddingRight: sides.right };
  const composerPad = { paddingLeft: sides.left, paddingRight: sides.right + info.scrollbar };
  // Eased once the pane has settled, so a thread opened cold draws in place.
  const easeShift = info.settled && "transition-[padding-left,padding-right] duration-200 ease-out motion-reduce:transition-none";
  /** Pictures drop anywhere on the conversation, not only on the box. */
  const columnRef = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);

  const composer = (
    <Composer
      draftKey={activeId != null ? draftKey(activeId, "chat") : newKey}
      provider={activeProvider}
      model={selection.model}
      reasoning={selection.effort}
      locked={locked}
      refused={refused}
      switchFrom={switchFrom}
      subjects={subjects}
      subjectId={activeSubject}
      subjectLocked={thread != null}
      unscoped={fresh && scope == null}
      running={running}
      usage={usage}
      rateLimits={rateLimits}
      restore={restore}
      onRestored={onRestored}
      onProvider={onProvider}
      onModel={onModel}
      onReasoning={onReasoning}
      onSend={send}
      onStop={onStop}
      onResume={onResume}
      onForceStop={onForceStop}
      autoFocus
      dropRef={columnRef}
      onDropping={setDropping}
      threadId={activeId}
    />
  );

  return (
    <SideNavShell panel={listPanel} nav={
      <ThreadList
        panel={listPanel}
        threads={threads}
        subjects={subjects}
        activeId={activeId}
        activeDraft={draftId}
        runningIds={runningIds}
        onOpen={onOpen}
        onOpenDraft={onOpenDraft}
        onDiscardDraft={onDiscardDraft}
        onNew={onNew}
        onDelete={onDelete}
      />
    }>

      <div ref={columnRef} className="relative flex h-full min-w-0 flex-1 flex-col">
        <PageHeader>
          <SideNavCollapseToggle panel={listPanel} />
          <PaneTrail>
            <PaneTitle>{fresh ? "New thread" : thread ? thread.title?.trim() || "Untitled" : ""}</PaneTitle>
          </PaneTrail>
          {infoCard && <ThreadInfoButton info={info} {...infoCard} />}
        </PageHeader>

        <div ref={info.areaRef} className="relative min-h-0 flex-1">
          {/* `overflow-y: scroll` keeps the scrollbar's gutter while nothing
              overflows, so a fold opening never narrows the column.
              `overflow-x-hidden` is load-bearing: it makes x `auto` too, and
              one wide row would scroll the whole thread. */}
          <div
            ref={scroll.outer}
            style={scrollPad}
            className={cn("h-full overflow-x-hidden overflow-y-scroll pt-6", fresh ? "pb-6" : "pb-10", easeShift)}
          >
            {fresh ? (
              <div key="recent" className="mx-auto w-full max-w-[760px]">
                {subjectsLoaded && <DraftHero subjects={subjects} scope={scope} onChoose={onChoose} className="pt-10 pb-8" />}
                <RecentThreads threads={threads} subjects={subjects} runningIds={runningIds} onOpen={onOpen} />
              </div>
            ) : (
              <div key="thread" ref={scroll.inner} className="mx-auto w-full max-w-[760px]">
                <Timeline
                  items={items}
                  threadId={activeId}
                  running={running}
                  questions={questions}
                  pending={pending}
                />
              </div>
            )}
          </div>
          {!fresh && (
            <>
              {/* Centred under the column, wherever the card has moved it. */}
              <div
                className={cn("pointer-events-none absolute inset-y-0", info.settled && "transition-[left,right] duration-200 ease-out motion-reduce:transition-none")}
                style={{ left: sides.left - PAD, right: sides.right - PAD + info.scrollbar }}
              >
                <JumpToLatest show={scroll.showJump} onClick={scroll.scrollToBottom} />
              </div>
              <ThreadMap scrollRef={scroll.outer} contentRef={scroll.inner} markers={markers} />
            </>
          )}
          {card.mounted && infoCard && (
            <div
              data-state={card.state}
              className={cn(
                "absolute z-20 will-change-[opacity,scale]",
                info.settled && "popup-motion [--popup-origin:top_right]",
              )}
              style={{ top: GAP, right: GAP + info.scrollbar }}
            >
              <ThreadInfoCard {...infoCard} onHeight={info.onCardHeight} />
            </div>
          )}
        </div>
        <div ref={composerRef} style={composerPad} className={cn("shrink-0 pb-4", easeShift)}>
          <div className="mx-auto max-w-[760px]" style={warping ? { viewTransitionName: WARP_NAME } : undefined}>
            {composer}
          </div>
        </div>

        <DropOverlay show={dropping} label="Drop to attach a picture" />
        <NewThreadDialog
          open={choosing}
          onOpenChange={setChoosing}
          subjects={subjects}
          value={scope}
          onPick={onChosen}
          focusAfterPick={focusComposer}
        />
      </div>
    </SideNavShell>
  );
}
