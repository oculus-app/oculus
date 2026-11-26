import { getThreadsByIds } from "@/lib/harness";
import { threadKnown } from "@/lib/studio/threadRunning";
import { useDraftStore } from "@/stores/chat/draftStore";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useVideosStore } from "./videosStore";
import { createSeriesMakeStore, readPartChats, type PartChats } from "./seriesMakeState";

const KEY = "oculus.studioPartChats";

/** Reads a part's chat by id when it is older than Chat's newest page; a
 *  chat that was deleted is forgotten. */
export async function keepThread(id: number): Promise<void> {
  if (threadKnown(useHarnessStore.getState(), id)) return;
  const thread = (await getThreadsByIds([id]))[0];
  if (thread) useHarnessStore.getState().keep(thread);
  else useSeriesMakeStore.getState().gone(id);
}

/** Persisted like Chat's drafts, so a relaunch keeps which chat makes which part. */
export const useSeriesMakeStore = createSeriesMakeStore({
  load: () => {
    try {
      return readPartChats(localStorage.getItem(KEY));
    } catch {
      return {};
    }
  },
  save: (chats: PartChats) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(chats));
    } catch {
      /* quota or private mode: the in-memory map still serves this launch */
    }
  },
  draftListed: (id) => id in useDraftStore.getState().newChats,
});

/** Chat's new chat `draftId` was sent and became `threadId`. */
export function noteNewChatSent(draftId: string, threadId: number): void {
  useSeriesMakeStore.getState().sent(draftId, threadId);
}

const listed = () => {
  const s = useVideosStore.getState();
  return s.loaded && s.error == null ? s.series : null;
};
const observe = () => useSeriesMakeStore.getState().observe(listed());

observe();
useVideosStore.subscribe(observe);
useDraftStore.subscribe((s, prev) => {
  if (s.newChats !== prev.newChats) observe();
});
