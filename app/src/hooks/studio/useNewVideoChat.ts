import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { getSubjects } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { chatHref } from "@/lib/harness";
import { hasDraft, newChatKey, useDraftStore } from "@/stores/chat/draftStore";

/** Opens a new chat in the subject's current (else newest) term, or General,
 *  and returns its draft id. The optional text is an unsent draft; by default
 *  it holds the Studio skill chip. The route opens once the subject is found;
 *  `choose` lands it with the subject picker open. */
export function useNewVideoChat() {
  const navigate = useNavigate();
  return useCallback((subject: string | null, text = "/oculus-studio ", choose = false) => {
    const drafts = useDraftStore.getState();
    const draft = drafts.openNewChat();
    drafts.setDraft(newChatKey(draft), text);
    void (async () => {
      let id: number | undefined;
      if (subject) {
        const matches = (await getSubjects().catch(() => [])).filter((s) => displayCode(s.code) === subject);
        id = (matches.find((s) => s.is_current) ?? matches[0])?.id;
      }
      navigate(chatHref(null, null, { draft, subject: id, choose }));
    })();
    return draft;
  }, [navigate]);
}

/** New video: a new chat holding the Studio skill chip, landing on the
 *  subject picker with the grid's subject (if any) highlighted. */
export function useStartVideo() {
  const open = useNewVideoChat();
  return useCallback((subject: string | null) => open(subject, undefined, true), [open]);
}

/** Shows a new chat that is already open. `text` refills its box only when
 *  it holds nothing, so words the student wrote stay. */
export function useShowNewChat() {
  const navigate = useNavigate();
  return useCallback((draft: string, text: string) => {
    const drafts = useDraftStore.getState();
    if (!hasDraft(drafts, newChatKey(draft))) drafts.setDraft(newChatKey(draft), text);
    navigate(chatHref(null, null, { draft }));
  }, [navigate]);
}
