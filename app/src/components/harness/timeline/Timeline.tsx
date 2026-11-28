import { memo, useMemo, useState } from "react";
import { copyAsMarkdown, dragAsMarkdown } from "@/lib/markdown/selection";
import { waitingQuestions, waitingRequests, type HarnessItem, type Provider } from "@/lib/harness";
import { useSignInStatus } from "@/hooks/agents/useSignInStatus";
import { ANCHOR_ROW } from "@/hooks/ui/useStickToBottom";
import { EXPANDABLE } from "@/lib/ui/expandable";
import { SignInDialog, useSignIn } from "../SignInDialog";
import { Bundle, Item } from "./ItemRows";
import { ArtifactRow, ContextDrift } from "./Messages";
import { RunWorkGroup } from "./RunWorkGroup";
import { LiveTail, Pending } from "./Pending";
import { buildRows, hasStreamedFence, replyKey, streamingReply } from "./rows";
import type { PendingActions, QuestionActions } from "./types";
import { useRowWindow } from "./useRowWindow";
import { useRowVisibility } from "./useRowVisibility";
import { RetainedRow } from "./RetainedRow";
import { RenderTile } from "../video/RenderTile";
import { VideoCard } from "../video/VideoCard";
import { ModelNamesProvider, RunDividerRow } from "./ModelNames";
import { ThreadAnnouncer } from "./ThreadAnnouncer";
import { AssistantSend } from "@/components/markdown/openui/assistant";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useThreadViewed } from "@/hooks/agents/useThreadViewed";
import { useThreadVideoSlug } from "@/hooks/studio/useThreadVideo";
import { ChatSaveScope } from "../save/ChatSaveScope";

/** A committed row: an anchor for `useStickToBottom`, with off-screen layout
 *  skipped by `useRowVisibility`. Padding on all edges preserves focus rings. */
const ROW = `${ANCHOR_ROW} skip-offscreen min-w-0 min-h-0`;

export type { PendingActions, QuestionActions } from "./types";

/**
 * The thread as a list. Each run is its question, one "Worked for 12s" fold
 * of its work, the widget fences of folded replies and its render tiles
 * (`RenderTile`), then its one answer and
 * any outcome row (`buildRows`). With `videoCard`, the video the thread is
 * making is a card (`VideoCard`) under the fold of the last run that worked
 * on it, or above the rows before any has. Rows from before runs, and turns the agent
 * started itself, keep the older shape: a finished step of two or more tool
 * or reasoning rows folds into one summary row ("Explored 3 files").
 *
 * **Nothing here re-renders for the turn in flight.** Committed rows never
 * change, so all are memoised; only `LiveTail`, a running `Tool` and a running
 * fold's clock subscribe to the stream or a timer. Only the newest rows mount
 * until the reader scrolls up (`useRowWindow`).
 */
export const Timeline = memo(function Timeline({
  items,
  threadId,
  running,
  questions,
  pending,
  videoCard = false,
}: {
  items: HarnessItem[];
  threadId: number | null;
  running: boolean;
  /** Draw the thread's Studio video as a card among its rows. */
  videoCard?: boolean;
  /** Stable for the life of the page — see `Item`. */
  questions?: QuestionActions;
  pending?: PendingActions;
}) {
  // Held here, not in the row, so the dialog survives rows re-rendering; and
  // in `Timeline`, not `ChatPage`, so the lecture dock gets it too.
  const [signIn, setSignIn] = useState<Provider | null>(null);
  const { recheck } = useSignInStatus();
  const run = useSignIn(recheck);

  const runs = useHarnessStore((s) => (threadId == null ? undefined : s.runs[threadId]));
  // Flips twice a reply, not per token.
  const streaming = useHarnessStore((s) => threadId != null && !!s.live[threadId]?.streaming);
  // A reply with a widget or ui fence streams as the row it will become, so its
  // frame or DOM nodes survive the commit. Flips once a reply.
  const streamsWidget = useHarnessStore((s) => threadId != null && hasStreamedFence(s.live[threadId]?.streaming ?? ""));
  const streamRow = useMemo(() => {
    if (!streamsWidget || threadId == null) return null;
    const at = streamingReply(items);
    if (!at) return null;
    const item: HarnessItem = {
      id: -1,
      thread_id: threadId,
      kind: "assistant",
      ref_id: null,
      content: null,
      meta: null,
      created_at: new Date().toISOString(),
      run_id: at.run,
    };
    return { key: replyKey(at.run, at.ordinal), item };
  }, [streamsWidget, threadId, items]);
  // Flips twice a thought, not per token.
  const thinking = useHarnessStore((s) => threadId != null && !!s.live[threadId]?.thinking);
  const videoSlug = useThreadVideoSlug(videoCard ? threadId : null);
  const rows = useMemo(
    () => buildRows(items, running, { runs, streaming, thinking, ...(videoSlug !== undefined && { video: { slug: videoSlug } }) }),
    [items, running, runs, streaming, thinking, videoSlug],
  );
  // No run has worked on the video yet (a series part's new chat): the card leads.
  const leadingCard = videoSlug !== undefined && threadId != null && !rows.some((r) => r.kind === "video");
  // The oldest waiting request's row, approval or question: always mounted
  // (`useRowWindow`).
  const waitingRow = useHarnessStore((s) => {
    if (threadId == null) return null;
    const oldest = [waitingRequests(s.requests[threadId])[0], waitingQuestions(s.requests[threadId])[0]]
      .filter((r) => r != null)
      .sort((a, b) => a.id - b.id)[0];
    return oldest?.item_id ?? null;
  });
  // A working fold already says so; the tail's "Working…" would repeat it,
  // even with a narration or a waiting request's row drawn below the fold.
  const folding = rows.some((r) => r.kind === "work" && r.state === "running");
  // Every view of a thread (a Chat tab, the lecture dock) draws it here.
  useThreadViewed(threadId);
  const { start, rootRef, sentinelRef } = useRowWindow(rows, threadId, waitingRow);
  useRowVisibility(rootRef, threadId);
  const shown = start ? rows.slice(start) : rows;
  const subjectId = useHarnessStore((s) => s.threads.find((t) => t.id === threadId)?.subject_id ?? null);
  return (
    <AssistantSend.Provider value={running ? null : questions?.followUp ?? null}>
      <ModelNamesProvider threadId={threadId}>
      <ChatSaveScope subjectId={subjectId} running={running}>
      <div
        ref={rootRef}
        {...{ [EXPANDABLE]: "" }}
        className="flex min-w-0 flex-col gap-2"
        onCopy={copyAsMarkdown}
        onDragStart={dragAsMarkdown}
      >
        {start > 0 && <div ref={sentinelRef} aria-hidden className="h-px shrink-0" />}
        {leadingCard && <VideoCard key={threadId} threadId={threadId} />}
        {shown.map((r) =>
          r.kind === "bundle" ? (
            <RetainedRow key={r.id} className={ROW}>
              <Bundle items={r.items} />
            </RetainedRow>
          ) : r.kind === "work" ? (
            <RetainedRow key={r.id} className={ROW}>
              <RunWorkGroup fold={r} />
            </RetainedRow>
          ) : r.kind === "artifacts" ? (
            <RetainedRow key={r.id} className={ROW}>
              <ArtifactRow item={r.item} />
            </RetainedRow>
          ) : r.kind === "render" ? (
            <RetainedRow key={r.id} className={ROW}>
              <RenderTile item={r.item} />
            </RetainedRow>
          ) : r.kind === "video" ? (
            <RetainedRow key={r.id} className={ROW}>
              {threadId != null && <VideoCard threadId={threadId} />}
            </RetainedRow>
          ) : (
            <RetainedRow key={r.key ?? r.item.id} className={ROW} questionId={r.item.kind === "user" ? r.item.id : undefined}>
              {r.change && <RunDividerRow change={r.change} />}
              <Item
                item={r.item}
                dim={r.dim}
                running={running && !r.dim}
                actions={questions}
                asked={r.asked}
                onSignIn={setSignIn}
                role={r.role}
              />
            </RetainedRow>
          ),
        ).concat(
          // In the same keyed list as the rows, under the key its committed row takes.
          streamRow ? (
            <RetainedRow key={streamRow.key} className={ROW}>
              {/* Committed item rows have `[divider, Item]` children; keep that
                  two-child shape here, or commit remounts the row's contents. */}
              {null}
              <Item item={streamRow.item} dim={false} actions={questions} role="provisional" stream />
            </RetainedRow>
          ) : [],
        )}
        {threadId != null && <ThreadAnnouncer threadId={threadId} />}
        {threadId != null && <ContextDrift threadId={threadId} />}
        {threadId != null && <LiveTail threadId={threadId} quiet={!folding} text={!streamRow} />}
        {threadId != null && pending && <Pending threadId={threadId} actions={pending} />}
        {signIn && (
          <SignInDialog
            provider={signIn}
            run={run.run?.provider === signIn ? run.run : null}
            onStart={() => run.start(signIn)}
            onCode={(code) => run.submitCode(code)}
            onCancel={() => run.cancel()}
            onClose={() => {
              // Clear a finished run; keep one in flight so reopening resumes it.
              if (run.run?.result) run.clear();
              setSignIn(null);
            }}
          />
        )}
      </div>
      </ChatSaveScope>
      </ModelNamesProvider>
    </AssistantSend.Provider>
  );
});
