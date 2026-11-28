import type { useClipPlayer } from "@/components/settings/voice/useClipPlayer";
import { GridTable, HeaderLabels } from "@/components/ui/table/GridTable";
import type { LexiconEntry } from "@/lib/studio/lexicon";
import { entryKey, LEXICON_COLS, LexiconRow } from "./LexiconRow";

/** The Lexicon tab: every saved word in the libraries the filter shows,
 *  global first, then each subject's in file order. */
export function LexiconTable({ entries, player, onChanged, emptyText }: {
  entries: LexiconEntry[];
  player: ReturnType<typeof useClipPlayer>;
  onChanged: () => void;
  emptyText: string | null;
}) {
  return (
    <GridTable
      cols={LEXICON_COLS}
      minWidth={640}
      header={<HeaderLabels labels={["Word", "Reading", "Phonemes", "Library", ""]} />}
      empty={emptyText ?? undefined}
    >
      <div className="divide-y divide-border-subtle">
        {entries.map((entry) => (
          <LexiconRow key={entryKey(entry)} entry={entry} player={player} onChanged={onChanged} />
        ))}
      </div>
    </GridTable>
  );
}
