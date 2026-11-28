import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { BookOpen, CaretRight, FolderSimple } from "@phosphor-icons/react";
import { SubjectIcon } from "@/components/subjects/SubjectIcon";
import { useScrollFade } from "@/hooks/ui/useScrollFade";
import type { PickerFolder } from "@/lib/drive/picker";
import { displayName } from "@/lib/format/format";

/** A folder being named before it is made. */
export interface FolderDraft {
  name: string;
  problem: string | null;
}

/**
 * The picker's one scroll area: the folders of the place it stands in, each
 * opening on a click, then the row a new folder is named in. Rows share one
 * tab stop; the dialog moves between them with the arrow keys
 * (`data-picker-row`).
 */
export function PickerList({ listRef, folders, past, draft, onOpen, onDraft, onCommit, note }: {
  listRef: RefObject<HTMLDivElement | null>;
  folders: readonly PickerFolder[];
  /** Subjects that are over, under their own heading. */
  past: readonly PickerFolder[];
  draft: FolderDraft | null;
  /** `byKey`: opened with Enter, Space or →, not the pointer. */
  onOpen: (rel: string, byKey: boolean) => void;
  onDraft: (name: string) => void;
  onCommit: () => void;
  /** Said in place of the rows: nothing to list yet, or why. */
  note: string | null;
}) {
  useScrollFade(listRef, "y");
  const [stop, setStop] = useState(0);
  const rows = [...folders, ...past];
  const row = (folder: PickerFolder) => {
    const index = rows.indexOf(folder);
    return (
      <button
        key={folder.rel}
        type="button"
        data-picker-row
        tabIndex={index === Math.min(stop, rows.length - 1) ? 0 : -1}
        title={folder.subject ? displayName(folder.subject.name, folder.subject.code) : undefined}
        onFocus={() => setStop(index)}
        onClick={(e) => onOpen(folder.rel, e.detail === 0)}
        className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] leading-[18px] text-foreground outline-none hover:bg-brand/10 focus-visible:bg-brand/10"
      >
        <Glyph>
          {folder.subject ? <SubjectIcon code={folder.subject.code} size={16} />
            : folder.subjects ? <BookOpen size={16} />
            : <FolderSimple size={16} weight="fill" />}
        </Glyph>
        <span className="min-w-0 flex-1 truncate">{folder.label}</span>
        <CaretRight size={11} aria-hidden className="shrink-0 text-muted-foreground/70 group-hover:text-foreground group-focus-visible:text-foreground" />
      </button>
    );
  };

  return (
    // `overflow-y: scroll` keeps the gutter, so a row that starts the
    // overflow never narrows the others (docs/ui.md).
    <div ref={listRef} tabIndex={-1} className="h-[min(14rem,calc(100dvh-17rem))] min-h-24 overflow-y-scroll p-1 outline-none">
      <div>
        {folders.map(row)}
        {past.length > 0 && <p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Past subjects</p>}
        {past.map(row)}
        {draft && <DraftRow draft={draft} onDraft={onDraft} onCommit={onCommit} />}
        {note && !draft && rows.length === 0 && <p className="px-2 py-1.5 text-[12.5px] leading-[18px] text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{children}</span>;
}

/** The new folder's row: its name in a field, selected so typing replaces
 *  it. Enter makes the folder; the dialog's own keys leave the field alone. */
function DraftRow({ draft, onDraft, onCommit }: {
  draft: FolderDraft;
  onDraft: (name: string) => void;
  onCommit: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <>
      <div className="flex items-center gap-2 rounded-md px-2 py-[3px]">
        <Glyph><FolderSimple size={16} weight="fill" /></Glyph>
        <input
          ref={ref}
          data-picker-draft
          value={draft.name}
          aria-label="Folder name"
          aria-invalid={!!draft.problem || undefined}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            e.stopPropagation();
            onCommit();
          }}
          className="h-6 min-w-0 flex-1 rounded-md border border-ring bg-card px-1.5 text-[12.5px] text-foreground ring-[3px] ring-ring/25 outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20"
        />
      </div>
      {draft.problem && <p role="alert" className="pr-2 pb-1 pl-8 text-[11.5px] leading-snug text-destructive">{draft.problem}</p>}
    </>
  );
}
