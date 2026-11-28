import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Books, NotePencil, X } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { SIDE_NAV_FOLDS } from "@/components/ui/layout/SideNav";
import type { Subject } from "@/lib/db";
import { displayCode } from "@/lib/format/format";
import { GENERAL_SCOPE, liveScope, type ChatScope } from "@/lib/harness/scope";
import { cn } from "@/lib/utils";
import { pressOpen } from "@/lib/ui/pressOpen";
import { hasDraft, newChatKey, useDraftStore } from "@/stores/chat/draftStore";
import { useShallow } from "zustand/react/shallow";
import { PreviewLine } from "../PreviewLine";
import { ROW_ACTIONS, ROW_META, ROW_TITLE, TITLE_READ, UNDER_ACTIONS } from "../rowType";
import { ROW_EXIT_MS, useRowPresence } from "./useRowPresence";

/** The divider's row id, never a new chat's (those are base 36). */
const DIVIDER = "-";

/** The pencil a row with unsent words wears, as T3's sidebar does. */
export const DRAFT_MARK = "shrink-0 text-warning";
/** The faint tint behind such a row while it is not the open one. */
export const DRAFT_TINT = "bg-warning/[0.07] hover:bg-warning/[0.11]";

/**
 * The new chats not yet sent, newest first, above the thread list and a
 * divider (both views): every one holding something. The one this tab is
 * writing has a row only if the tab left it holding something (`activeListed`,
 * from `useLeftDraft`), and that row stays as the tab found it, so typing in
 * a new chat draws nothing here. A row is the draft's scope and its first
 * line, chips drawn (`PreviewLine`); hover offers to discard it.
 */
export const DraftRows = memo(function DraftRows({
  subjects,
  activeDraft,
  activeListed,
  onOpen,
  onDiscard,
}: {
  subjects: Subject[];
  activeDraft: string | null;
  activeListed: boolean;
  onOpen: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const ids = useDraftStore(
    useShallow((s) =>
      Object.entries(s.newChats)
        .filter(([id]) => (id === activeDraft ? activeListed : hasDraft(s, newChatKey(id))))
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id),
    ),
  );
  // A discard folds the row first and forgets the draft once it has gone, so
  // whatever the store change sets off can't hold up the fold's frames.
  const [discarding, setDiscarding] = useState<ReadonlySet<string>>(() => new Set());
  const discard = useCallback(
    (id: string) => {
      setDiscarding((s) => new Set(s).add(id));
      window.setTimeout(() => {
        onDiscard(id);
        setDiscarding((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }, ROW_EXIT_MS);
    },
    [onDiscard],
  );
  // The divider joins with the first row and leaves with the last.
  const rows = useRowPresence(
    useMemo(() => {
      const kept = discarding.size ? ids.filter((id) => !discarding.has(id)) : ids;
      return kept.length ? [...kept, DIVIDER] : kept;
    }, [ids, discarding]),
  );
  if (!rows.length) return null;
  return (
    <section aria-label="Drafts" className="flex flex-col">
      {rows.map(({ id, gone, enter }) => (
        <div
          key={id}
          className="row-presence"
          data-state={gone == null ? "open" : "closed"}
          data-enter={enter || undefined}
          aria-hidden={gone != null || id === DIVIDER || undefined}
        >
          {/* The clip pads nothing, or a closed row keeps its padding's height. */}
          <div>
            {id === DIVIDER ? (
              <div className="px-2.5 pt-1 pb-1.5">
                <div className="h-px bg-border-subtle" />
              </div>
            ) : (
              <div className="pb-0.5">
                <DraftRow
                  id={id}
                  subjects={subjects}
                  active={id === activeDraft && gone == null}
                  still={id === activeDraft || gone != null}
                  onOpen={onOpen}
                  onDiscard={discard}
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
});

function DraftRow({
  id,
  subjects,
  active,
  still,
  onOpen,
  onDiscard,
}: {
  id: string;
  subjects: Subject[];
  active: boolean;
  /** Open in this tab or folding away: it keeps showing what it last drew,
   *  whatever is typed in it since (or cleared by a discard). */
  still: boolean;
  onOpen: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const key = newChatKey(id);
  const last = useRef<{ text: string; pastes: number; pictures: number; stored: ChatScope | undefined } | null>(null);
  // While still, the selector answers what it drew, so the store wakes nothing.
  const shown = useDraftStore(
    useShallow(
      (s) =>
        (still && last.current) || {
          text: s.drafts[key] ?? "",
          pastes: s.pastes[key]?.length ?? 0,
          pictures: s.shelves[key]?.length ?? 0,
          stored: s.scopes[key],
        },
    ),
  );
  last.current = shown;
  const { text, pastes, pictures, stored } = shown;
  const scope = liveScope(stored, subjects);
  const subject = typeof scope === "number" ? subjects.find((s) => s.id === scope) : undefined;
  const line = text.split("\n").map((l) => l.trim()).find(Boolean);
  const title = line ? (
    <PreviewLine text={line} />
  ) : pastes ? (
    "Pasted text"
  ) : pictures ? (
    pictures === 1 ? "A picture" : `${pictures} pictures`
  ) : null;
  return (
    <div
      className={cn(
        "group/thread relative rounded-lg",
        active ? "bg-sidebar-item-active" : title ? DRAFT_TINT : "hover:bg-sidebar-item-hover",
      )}
    >
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        {...pressOpen(() => onOpen(id))}
        className="flex w-full min-w-0 flex-col px-2.5 pt-1.5 pb-[7px] text-left"
      >
        <span className={cn("flex h-[18px] w-full min-w-0 items-center gap-1.5", ROW_META, UNDER_ACTIONS)}>
          <NotePencil size={13} className={DRAFT_MARK} aria-label="Draft" />
          {subject ? (
            <SubjectIcon code={subject.code} size={13} />
          ) : scope === GENERAL_SCOPE ? (
            <Books size={13} className="shrink-0" />
          ) : null}
          <span className={cn("min-w-0 truncate font-medium", SIDE_NAV_FOLDS)}>
            {subject ? displayCode(subject.code) : scope === GENERAL_SCOPE ? "General" : "No subject yet"}
          </span>
        </span>
        <span className={cn("flex h-[21px] w-full min-w-0 items-center", ROW_TITLE, SIDE_NAV_FOLDS)}>
          <span className={cn("min-w-0 flex-1 truncate", title ? TITLE_READ : "text-muted-foreground")}>
            {title ?? "New chat"}
          </span>
        </span>
      </button>
      <div className={cn("absolute top-1 right-1.5 flex items-center", SIDE_NAV_FOLDS, "group-data-[collapsed=true]/nav:pointer-events-none")}>
        <div data-row-actions className={cn("flex items-center", ROW_ACTIONS)}>
          <button
            type="button"
            aria-label="Discard draft"
            title="Discard draft"
            onClick={() => onDiscard(id)}
            className="flex h-[22px] w-6 items-center justify-center rounded-[5px] text-muted-foreground outline-none transition-colors hover:bg-sidebar-item-active hover:text-foreground"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
