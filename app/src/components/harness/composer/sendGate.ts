/** The placeholder a new chat's box shows until the headline has a subject. */
export const UNSCOPED_PLACEHOLDER = "Choose a subject above to start a chat";

/**
 * Whether the send button is live: there is something to send and the
 * thread's scope is chosen, or a press can ask for it (`choose`). Words,
 * pictures and pasted cards still collect meanwhile, so nothing is lost
 * while the student picks.
 */
export function canSend({ ready, unscoped, choose = false }: { ready: boolean; unscoped: boolean; choose?: boolean }): boolean {
  return ready && (!unscoped || choose);
}
