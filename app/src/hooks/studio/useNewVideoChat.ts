import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { getSubjects } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { chatHref } from "@/lib/harness";
import { draftKey, useDraftStore } from "@/stores/chat/draftStore";

const CHIP = /(^|\s)\/oculus-studio(?=\s|$)/;

/**
 * Studio's New video: a new Chat thread whose box already holds the
 * `oculus-studio` skill chip (a stored `/name` becomes a chip as the box
 * loads), in the subject Studio is showing when it names one. Whatever the
 * new thread's box already held is kept after the chip. The returned call
 * takes the subject at the moment of the press: a video's course code
 * without its term, as Studio files them, or null.
 */
export function useNewVideoChat() {
  const navigate = useNavigate();
  return useCallback(async (subject: string | null) => {
    const key = draftKey(null, "chat");
    const drafts = useDraftStore.getState();
    const text = drafts.drafts[key] ?? "";
    if (!CHIP.test(text)) drafts.setDraft(key, `/oculus-studio ${text}`);
    let id: number | undefined;
    if (subject) {
      const matches = (await getSubjects().catch(() => [])).filter((s) => displayCode(s.code) === subject);
      id = (matches.find((s) => s.is_current) ?? matches[0])?.id;
    }
    navigate(chatHref(null, null, id != null ? { subject: id } : undefined));
  }, [navigate]);
}
