import type { HistoryEvent } from "@/lib/studio/pronunciations";
import { HistoryRow } from "./HistoryRow";

/** The History tab: every decision and lexicon change, newest first. */
export function HistoryList({ events, onReverted, emptyText }: {
  events: HistoryEvent[];
  onReverted: () => void;
  emptyText: string;
}) {
  if (events.length === 0) return <p className="py-16 text-center text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border-subtle">
      {events.map((event) => (
        <HistoryRow key={event.id} event={event} onReverted={onReverted} />
      ))}
    </ul>
  );
}
