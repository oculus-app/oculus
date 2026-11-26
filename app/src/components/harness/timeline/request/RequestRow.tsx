import { memo, useMemo } from "react";
import { ShieldCheck, ShieldSlash } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { requestDetail, requestState, type HarnessItem, type HarnessRequest, type RequestState } from "@/lib/harness";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { QuestionView } from "./QuestionRow";
import { RequestBody } from "./RequestBody";
import { SettledRow } from "./SettledRow";
import { WaitingRow } from "./WaitingRow";

const SETTLED_ICON: Record<Exclude<RequestState["kind"], "waiting">, Icon> = {
  approved: ShieldCheck,
  declined: ShieldSlash,
  expired: ShieldSlash,
  cancelled: ShieldSlash,
};

/**
 * A `request` row: it holds the request's id, and the request itself is
 * read from the store (`harnessStore.requests`), so an answer, a delivery
 * or an ending redraws only this row. While it waits it is one line saying
 * so, opening to everything the agent asked; the answer is given in the
 * composer's approval tray (`RequestTray`). Settled, it is one quiet line
 * saying how, opening to what was asked. A question is `QuestionView`'s.
 */
export const RequestRow = memo(function RequestRow({ item }: { item: HarnessItem }) {
  const id = Number(item.ref_id);
  const request = useHarnessStore((s) => s.requests[item.thread_id]?.[id]);
  if (!request) return null;
  if (request.kind === "question") return <QuestionView request={request} />;
  return <RequestView request={request} />;
});

/** A request as its row draws it, given the request. */
export function RequestView({ request }: { request: HarnessRequest }) {
  const detail = useMemo(() => requestDetail(request), [request]);
  const state = requestState(request);

  if (state.kind === "waiting") {
    return (
      <WaitingRow
        requestId={request.id}
        tone="warning"
        label="Waiting for you"
        subject={detail.subject}
        code={detail.command != null}
        notes={state.notes}
        warn={state.warn}
      >
        <p className="text-[11px] text-muted-foreground">{detail.title}</p>
        <RequestBody detail={detail} />
      </WaitingRow>
    );
  }

  return (
    <SettledRow
      icon={SETTLED_ICON[state.kind]}
      state={state.kind}
      label={state.label}
      subject={detail.subject}
      title={detail.title}
      notes={state.notes}
      warn={state.warn}
    >
      <RequestBody detail={detail} />
    </SettledRow>
  );
}
