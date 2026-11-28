import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { DRIVE_CHANGED_EVENT } from "@/lib/drive/listing";
import { useChatSaves } from "@/stores/chat/chatSaveStore";

/** The chat's subject, whose folder a save opens the picker on (the top
 *  level for none). Null outside a chat, where nothing offers a save. */
const ChatSaveContext = createContext<{ subjectId: number | null } | null>(null);

export const useChatSaveScope = () => useContext(ChatSaveContext);

/**
 * Marks a chat's rows as places a chat output can be saved from, and asks
 * again about every output shown when a turn ends (the agent may have
 * rewritten one) or Drive changes (a saved copy may be gone).
 */
export function ChatSaveScope({
  subjectId,
  running = false,
  children,
}: {
  subjectId: number | null;
  running?: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ subjectId }), [subjectId]);

  const ran = useRef(running);
  useEffect(() => {
    if (ran.current && !running) useChatSaves.getState().refresh();
    ran.current = running;
  }, [running]);

  useEffect(() => {
    const refresh = () => useChatSaves.getState().refresh();
    window.addEventListener(DRIVE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DRIVE_CHANGED_EVENT, refresh);
  }, []);

  return <ChatSaveContext.Provider value={value}>{children}</ChatSaveContext.Provider>;
}
