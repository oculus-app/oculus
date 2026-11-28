import { ArrowRight } from "@phosphor-icons/react";

import type { useClipPlayer } from "@/components/settings/voice/useClipPlayer";
import { Button } from "@/components/ui/button";
import { pronunciationSample, type Pronunciation, type PronunciationDecision } from "@/lib/studio/pronunciations";
import { PronunciationRow } from "./PronunciationRow";

/** What a decision wrote, said in the decided row's place. */
export interface Decided {
  line: string;
  word: string;
}

/**
 * The Review tab: each suggestion waiting for a verdict (and each sent back,
 * muted). A decided row gives way to its line and View in lexicon until the
 * next reload.
 */
export function ReviewList({ items, decided, player, onDecide, onWrong, onShowWord, emptyText }: {
  items: Pronunciation[];
  decided: Record<string, Decided>;
  player: ReturnType<typeof useClipPlayer>;
  onDecide: (item: Pronunciation, decision: PronunciationDecision) => Promise<void>;
  onWrong: (item: Pronunciation, note: string | null) => Promise<void>;
  onShowWord: (word: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="py-16 text-center text-xs text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y divide-border-subtle">
      {items.map((item) => {
        const done = decided[item.id];
        return done ? (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
            <span className="min-w-0 text-xs text-muted-foreground">{done.line}</span>
            <Button variant="ghost" size="xs" onClick={() => onShowWord(done.word)}>
              View in lexicon
              <ArrowRight />
            </Button>
          </li>
        ) : (
          <PronunciationRow
            key={item.id}
            item={item}
            player={player}
            onPlay={(which) => void player.play(`${item.id}:${which}`, () => pronunciationSample(item.id, which))}
            onDecide={(decision) => onDecide(item, decision)}
            onWrong={(note) => onWrong(item, note)}
          />
        );
      })}
    </ul>
  );
}
