import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { getSubjects } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { chatHref } from "@/lib/harness";
import { newChatKey, useDraftStore } from "@/stores/chat/draftStore";

/**
 * Studio's New video: a new chat of its own whose box holds the
 * `oculus-studio` skill chip (a stored `/name` becomes a chip as the box
 * loads), in the subject Studio is showing when it names one. The returned
 * call takes the subject at the moment of the press: a video's course code
 * without its term, as Studio files them, or null.
 */
export function useNewVideoChat() {
  const navigate = useNavigate();
  return useCallback(async (subject: string | null) => {
    const drafts = useDraftStore.getState();
    const draft = drafts.openNewChat();
    drafts.setDraft(newChatKey(draft), "/oculus-studio ");
    let id: number | undefined;
    if (subject) {
      const matches = (await getSubjects().catch(() => [])).filter((s) => displayCode(s.code) === subject);
      id = (matches.find((s) => s.is_current) ?? matches[0])?.id;
    }
    navigate(chatHref(null, null, { draft, subject: id }));
  }, [navigate]);
}
