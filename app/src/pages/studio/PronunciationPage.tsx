import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";

import { NewCountBadge } from "@/components/NewCountBadge";
import { SearchField } from "@/components/settings/agents/opencode/parts";
import { useClipPlayer } from "@/components/settings/voice/useClipPlayer";
import { AddWordForm } from "@/components/studio/pronunciation/AddWordForm";
import { HistoryList } from "@/components/studio/pronunciation/HistoryList";
import { LexiconTable } from "@/components/studio/pronunciation/LexiconTable";
import { LibraryPicker } from "@/components/studio/pronunciation/LibraryPicker";
import { ReviewList, type Decided } from "@/components/studio/pronunciation/ReviewList";
import { usePronunciationData } from "@/components/studio/pronunciation/usePronunciationData";
import { StudioHeader } from "@/components/studio/StudioHeader";
import { Button } from "@/components/ui/button";
import { LoadingFill } from "@/components/ui/layout/PageParts";
import { ViewTabs, type ViewTab } from "@/components/ui/table/ViewTabs";
import { displayCode, humanizeSlug } from "@/lib/format/format";
import {
  historyMatches,
  inLibrary,
  lexiconMatches,
  libraryCodes,
  openingTab,
  reviewMatches,
  type LibraryFilter,
} from "@/lib/studio/pronunciationView";
import {
  decidePronunciation,
  markPronunciationWrong,
  type Pronunciation,
  type PronunciationDecision,
} from "@/lib/studio/pronunciations";
import { useHarnessStore } from "@/stores/chat/harnessStore";
import { usePendingPronunciations } from "@/stores/studio/pronunciationCountStore";
import { useVideosStore } from "@/stores/studio/videosStore";

type Tab = "review" | "lexicon" | "history";

/** A tab's count beside its label, muted (Review's is a `NewCountBadge` while words wait). */
function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-surface px-1.5 text-[11px] font-normal tabular-nums text-muted-foreground">{n}</span>
  );
}

/** What a decision wrote, said in the decided row's place. */
function decidedLine(item: Pronunciation, decision: PronunciationDecision, title: string): string {
  const lexicon = item.subject ? `${displayCode(item.subject)}'s lexicon` : "the global lexicon";
  const what = decision === "correct" ? `Added “${item.reading}” to ${lexicon}` : `Kept the guess in ${lexicon}`;
  return `${item.word}: ${what} — applies when ${title} is next narrated`;
}

/**
 * /studio/pronunciation: the readings the Studio agent suggested for words
 * Kokoro guessed (Review), the saved lexicons (Lexicon) and every decision
 * and lexicon change (History), narrowed by library and by a word filter.
 * Opens on Review while anything waits, else Lexicon. One clip plays at a
 * time across the page.
 */
export default function PronunciationPage() {
  const [tab, setTab] = useState<Tab | null>(null);
  const [library, setLibrary] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [decided, setDecided] = useState<Record<string, Decided>>({});
  const player = useClipPlayer();
  const subjects = useHarnessStore((s) => s.subjects);

  const onItems = useCallback((rows: Pronunciation[]) => {
    setDecided({});
    setTab((t) => t ?? openingTab(rows));
  }, []);
  const { items, lexicon, history, loadHistory, lexiconChanged, replaceItem } = usePronunciationData(onItems);
  // Until the first read picks a tab; a failed one shows Review, to say so.
  const shown: Tab = tab ?? "review";
  const loading = tab === null && !items.error;

  useEffect(() => {
    void useHarnessStore.getState().loadSubjects();
    document.title = "Pronunciation · Oculus";
    return () => {
      document.title = "Oculus";
    };
  }, []);

  const codes = useMemo(
    () =>
      libraryCodes(
        [
          ...(items.rows ?? []).map((i) => i.subject),
          ...(lexicon.rows ?? []).map((e) => e.subject),
          ...(history.rows ?? []).map((e) => e.subject),
        ],
        subjects.filter((s) => s.is_current).map((s) => s.code),
      ),
    [items.rows, lexicon.rows, history.rows, subjects],
  );

  const reviewRows = useMemo(
    () => (items.rows ?? []).filter((i) => inLibrary(library, i.subject) && reviewMatches(i, query)),
    [items.rows, library, query],
  );
  const lexiconRows = useMemo(
    () => (lexicon.rows ?? []).filter((e) => inLibrary(library, e.subject) && lexiconMatches(e, query)),
    [lexicon.rows, library, query],
  );
  const historyRows = useMemo(
    () => (history.rows ?? []).filter((e) => inLibrary(library, e.subject) && historyMatches(e, query)),
    [history.rows, library, query],
  );

  const pending = (items.rows ?? []).filter(
    (i) => i.status === "pending" && !decided[i.id] && inLibrary(library, i.subject),
  ).length;
  const tabs: ViewTab<Tab>[] = [
    { value: "review", label: "Review", badge: pending > 0 ? <NewCountBadge count={pending} /> : <Count n={0} /> },
    { value: "lexicon", label: "Lexicon", badge: <Count n={(lexicon.rows ?? []).filter((e) => inLibrary(library, e.subject)).length} /> },
    { value: "history", label: "History", badge: <Count n={(history.rows ?? []).filter((e) => inLibrary(library, e.subject)).length} /> },
  ];

  const decide = async (item: Pronunciation, decision: PronunciationDecision) => {
    await decidePronunciation(item.id, decision);
    if (player.current?.key.startsWith(`${item.id}:`)) player.stop();
    const title = useVideosStore.getState().videos.find((v) => v.slug === item.video)?.title ?? humanizeSlug(item.video);
    setDecided((d) => ({ ...d, [item.id]: { line: decidedLine(item, decision, title), word: item.word } }));
    void usePendingPronunciations.getState().reload();
    lexiconChanged();
  };
  const markWrong = async (item: Pronunciation, note: string | null) => {
    replaceItem(await markPronunciationWrong(item.id, note));
    void usePendingPronunciations.getState().reload();
    void loadHistory();
  };
  const showWord = (word: string) => {
    setQuery(word);
    setTab("lexicon");
  };

  const q = query.trim();
  const body = loading ? (
    <Loading />
  ) : shown === "review" ? (
    <Scroll>
      {items.error ? (
        <ErrorLine>{items.error}</ErrorLine>
      ) : (
        <ReviewList
          items={reviewRows}
          decided={decided}
          player={player}
          onDecide={decide}
          onWrong={markWrong}
          onShowWord={showWord}
          emptyText={q ? `No suggestion matches “${q}”.` : "No words waiting for review."}
        />
      )}
    </Scroll>
  ) : shown === "lexicon" ? (
    lexicon.error ? (
      <Scroll>
        <ErrorLine>{lexicon.error}</ErrorLine>
      </Scroll>
    ) : lexicon.rows === null ? (
      <Loading />
    ) : (
      <div className="min-h-0 flex-1">
        <LexiconTable
          entries={lexiconRows}
          player={player}
          onChanged={lexiconChanged}
          emptyText={lexiconRows.length > 0 ? null : q ? `No saved word matches “${q}”.` : "No saved words yet."}
        />
      </div>
    )
  ) : history.rows === null && !history.error ? (
    <Loading />
  ) : (
    <Scroll>
      {history.error ? (
        <ErrorLine>{history.error}</ErrorLine>
      ) : (
        <HistoryList
          events={historyRows}
          onReverted={lexiconChanged}
          emptyText={q ? `No change matches “${q}”.` : "Nothing decided or changed yet."}
        />
      )}
    </Scroll>
  );

  return (
    <>
      <StudioHeader
        title="Pronunciation"
        actions={
          <>
            <LibraryPicker codes={codes} value={library} onChange={setLibrary} all label="Library" />
            <Button type="button" size="xs" onClick={() => setAdding(true)} disabled={adding}>
              <Plus weight="bold" />
              Add word
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border-subtle px-5 pt-3">
        <ViewTabs tabs={tabs} value={shown} onChange={setTab} />
        <div className="pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Filter words…" />
        </div>
      </div>
      {adding && (
        <AddWordForm
          codes={codes}
          initial={library === "all" ? "global" : library}
          player={player}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setTab("lexicon");
            lexiconChanged();
          }}
        />
      )}
      {body}
    </>
  );
}

/** The spinner in the body's place. */
function Loading() {
  return (
    <div className="min-h-0 flex-1">
      <LoadingFill />
    </div>
  );
}

/** The page's one scroller, for the list tabs. */
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-scroll min-h-0 flex-1">
      <div className="px-5 pb-6">{children}</div>
    </div>
  );
}

function ErrorLine({ children }: { children: string }) {
  return (
    <p className="py-4 text-[12px] leading-relaxed text-destructive" data-selectable>
      {children}
    </p>
  );
}
