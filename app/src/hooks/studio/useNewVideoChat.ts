import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { getSubjects } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { chatHref } from "@/lib/harness";
import { newChatKey, useDraftStore } from "@/stores/chat/draftStore";

/** Opens a new chat in the subject's current (else newest) term, or General.
 * The optional text is an unsent draft; by default it holds the Studio skill chip. */
export function useNewVideoChat() {
  const navigate = useNavigate();
  return useCallback(async (subject: string | null, text = "/oculus-studio ") => {
    const drafts = useDraftStore.getState();
    const draft = drafts.openNewChat();
    drafts.setDraft(newChatKey(draft), text);
    let id: number | undefined;
    if (subject) {
      const matches = (await getSubjects().catch(() => [])).filter((s) => displayCode(s.code) === subject);
      id = (matches.find((s) => s.is_current) ?? matches[0])?.id;
    }
    navigate(chatHref(null, null, { draft, subject: id }));
  }, [navigate]);
}
