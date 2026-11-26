import { create } from "zustand";

/**
 * The approval tray's "Show all in the conversation": it names a request,
 * and that request's waiting row opens itself and scrolls into view. `nonce`
 * makes a second press on the same request a second reveal.
 */
interface RequestRevealState {
  id: number | null;
  nonce: number;
  reveal: (id: number) => void;
}

export const useRequestReveal = create<RequestRevealState>((set) => ({
  id: null,
  nonce: 0,
  reveal: (id) => set((s) => ({ id, nonce: s.nonce + 1 })),
}));
