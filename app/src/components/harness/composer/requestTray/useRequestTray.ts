import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  harnessRespond,
  requestActions,
  requestDetail,
  requestRisk,
  trayKeyAction,
  waitingRequests,
  type HarnessRequest,
  type RequestOption,
  type TrayKeyInput,
} from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { useRunCommand } from "../useRunCommand";

const NONE: HarnessRequest[] = [];

/** The keypress fields `trayKeyAction` reads, from a DOM or React event. */
export interface TrayKeyEvent {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

export interface RequestTrayState {
  request: HarnessRequest;
  /** How many approvals wait, this one included. */
  count: number;
  busy: boolean;
  error: string | null;
  respond: (option: RequestOption) => void;
  /** Answers the request when the key is one of the tray's (`trayKeyAction`);
   *  true when it did, so the caller prevents the key. */
  press: (
    e: TrayKeyEvent,
    composing: boolean,
    where: Pick<TrayKeyInput, "focus" | "draftEmpty" | "menuOpen">,
  ) => boolean;
}

/**
 * The approval tray's state, for both composers: the oldest waiting
 * approval, answered once with one `harnessRespond` (inert until it
 * returns, Rust's refusal kept in `error`). The request's time on screen,
 * which the keys wait out, starts when it becomes the oldest.
 */
export function useRequestTray(threadId: number | null): RequestTrayState | null {
  const waiting = useHarnessStore(useShallow((s) => (threadId == null ? NONE : waitingRequests(s.requests[threadId]))));
  // Answered here and saved by Rust, until its `request_updated` replaces
  // the object (a failed delivery comes back pending, to answer again).
  const [answered, setAnswered] = useState<readonly HarnessRequest[]>([]);
  const open = waiting.filter((r) => !answered.includes(r));
  const request = threadId != null ? (open[0] ?? null) : null;
  const answer = useRunCommand();
  const { clear } = answer;
  const requestId = request?.id ?? null;
  // A refusal belongs to the request it was about.
  useEffect(() => clear(), [requestId, clear]);
  const since = useRef<{ id: number; at: number } | null>(null);
  useEffect(() => {
    since.current = requestId == null ? null : { id: requestId, at: performance.now() };
  }, [requestId]);
  const tone = useMemo(() => (request ? requestRisk(request, requestDetail(request)).tone : "caution"), [request]);

  if (!request || threadId == null) return null;

  const respond = (option: RequestOption) =>
    void answer.run(async () => {
      await harnessRespond(threadId, request.id, option.id);
      setAnswered((s) => [...s.filter((r) => waiting.includes(r)), request]);
    });

  return {
    request,
    count: open.length,
    busy: answer.pending,
    error: answer.error,
    respond,
    press: (e, composing, where) => {
      const at = since.current;
      const action = trayKeyAction({
        key: e.key,
        repeat: e.repeat,
        modified: e.metaKey || e.ctrlKey || e.altKey || e.shiftKey,
        composing,
        prevented: e.defaultPrevented,
        ready: !answer.pending,
        tone,
        ageMs: at && at.id === request.id ? performance.now() - at.at : 0,
        ...where,
      });
      if (!action) return false;
      const actions = requestActions(request);
      const option = action === "allow" ? actions.approve : actions.decline;
      if (!option) return false;
      respond(option);
      return true;
    },
  };
}
