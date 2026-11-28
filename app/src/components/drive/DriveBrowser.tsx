import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Folder, FolderSimple, LockSimple, Warning, X } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DropOverlay } from "@/components/ui/layout/DropOverlay";
import { SkeletonRows } from "@/components/ui/layout/PageParts";
import { NotebookDialog } from "@/components/whiteboard/NotebookDialog";
import { useSubjects } from "@/hooks/data/useSubjects";
import { useWindowEvent } from "@/hooks/backend/useEvents";
import { useDriveDrop } from "@/hooks/drive/useDriveDrop";
import { useDriveRows } from "@/hooks/drive/useDriveRows";
import { useElementWidth } from "@/hooks/drive/useElementWidth";
import { useFolderListing } from "@/hooks/drive/useFolderListing";
import { useReconcileParseStatus } from "@/hooks/sync/useReconcileParseStatus";
import { useStoredSet, useStoredState } from "@/hooks/ui/useStoredState";
import { copyToFolder, deleteAll, dropInto, DRIVE_PROBLEM_EVENT, importInto, moveToFolder, renameTo } from "@/lib/drive/actions";
import { READ_ONLY_TEXT } from "@/lib/drive/commands";
import { startEntryDrag } from "@/lib/drive/drop";
import { isFlat, NO_FILTERS, type DriveFilters } from "@/lib/drive/filters";
import { homeOf, isSubjectsFolder } from "@/lib/drive/home";
import { isFixedFolder, itemEditable, itemZone, type DriveItem } from "@/lib/drive/items";
import { itemHref, openInNewTab, openItem, revealItem } from "@/lib/drive/open";
import { baseName, parentRel } from "@/lib/drive/paths";
import { boxSelect, clickSelect, EMPTY_SELECTION, pruneSelection, selectAll, type Selection } from "@/lib/drive/selection";
import { filePagePath } from "@/lib/files/openFile";
import { scheduleOwnReconcile } from "@/lib/drive/reconcile";
import { isMac } from "@/lib/platform";
import { navigateActive } from "@/lib/shell/tabRouters";
import { pickDriveFolder } from "@/stores/shell/drivePickerStore";
import { DriveViewProvider, type DriveView } from "./DriveContext";
import { DriveGrid } from "./content/DriveGrid";
import { DriveList } from "./content/DriveList";
import { DetailsPanel } from "./details/DetailsPanel";
import { driveCrumbs } from "./header/crumbs";
import { DriveHeader } from "./header/DriveHeader";
import { makeNew } from "./header/makeNew";
import { NewMenu, type NewKind } from "./header/NewMenu";
import { DriveToolbar, type DriveLayout } from "./toolbar/DriveToolbar";
import { useDriveGroups } from "./useDriveGroups";
import { useMarquee } from "./useMarquee";

/** Below this width the list keeps two columns; from the other the details
 *  panel can be shown. Measured on the browser itself, never the window. */
const NARROW = 560;
const DETAILS = 900;

export interface DriveBrowserProps {
  /** Data-dir-relative folder the browser starts at: `""` for the data
   *  folder's top level (Drive), `courses/<code>` for one subject (its Files
   *  tab). */
  root: string;
  /** The folder on screen, at or below `root`; the route's path. */
  folder: string;
  /** The route that shows a folder, for crumbs, the tree and opening one. */
  folderHref: (rel: string) => string;
  /** The first crumb: "My Drive" at Drive's top level, "Files" in a subject. */
  rootLabel?: string;
  /** Before the crumbs: the page's nav toggle. */
  leading?: ReactNode;
}

/**
 * The folder browser of Drive and a subject's Files tab: one folder of the
 * library at a time (`list_folder`), with the `files` rows joined on for
 * parse state and recency. Drive's top level is the data folder: Subjects,
 * then the student's own folders and files, whose rows hang off `TOP_LEVEL`. A header (trail, folder search, New), a toolbar
 * (Type / From / Modified, which switch to a flat list of everything below,
 * and grid or list, remembered per root), the entries, and a details panel
 * for one selected file in a wide pane. Entries select as in Finder, open on
 * double-click, rename in place, and drag: between the student's folders a
 * drag moves, out of the synced folders it copies, and a folder the student
 * can't add to refuses visibly. Finder files drop on a folder or the empty
 * space. docs/frontend.md has the whole contract.
 */
export function DriveBrowser({ root, folder, folderHref, rootLabel, leading }: DriveBrowserProps) {
  const { subjects } = useSubjects();
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(rootRef);

  const [filters, setFilters] = useState<DriveFilters>(NO_FILTERS);
  const flat = isFlat(filters);
  const { listing, error } = useFolderListing(folder, flat);
  // The subject the folder is in, or the top level; none in the folder of
  // subjects itself.
  const home = homeOf(folder, subjects);
  const homeId = home?.id;
  const homeCode = home?.code;
  const rowHomes = useMemo(() => {
    if (!flat || !listing) return homeId != null ? [homeId] : [];
    // The flat list reaches into every home below the folder.
    return listing.files.flatMap((f) => homeOf(f.relativePath, subjects)?.id ?? []);
  }, [homeId, flat, listing, subjects]);
  const rows = useDriveRows(rowHomes);
  // Files an agent or Finder wrote get their rows (debounced per home), and
  // a parse an earlier session finished shows as parsed.
  useEffect(() => {
    if (homeId != null && homeCode) scheduleOwnReconcile({ id: homeId, code: homeCode });
  }, [homeId, homeCode, folder]);
  const listedRows = useMemo(
    () => listing?.files.flatMap((f) => rows.get(f.relativePath) ?? []) ?? [],
    [listing, rows],
  );
  useReconcileParseStatus(listedRows);

  const [layout, setLayout] = useStoredState<DriveLayout>(
    `oculus-drive-layout:${root || "drive"}`,
    (raw) => (raw === "grid" || raw === "list" ? raw : root ? "list" : "grid"),
  );
  /** The details panel is the student's to open (the toolbar's Info), never
   *  opened by selecting; remembered across folders and launches. */
  const [detailsOpen, setDetailsOpen] = useStoredState<boolean>("oculus-drive-details", (raw) => raw === "true");
  const [openGroups, setOpenGroups] = useStoredSet("oculus-drive-open-groups");
  const folds = useMemo(() => ({
    open: openGroups,
    toggle: (key: string) => setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    }),
  }), [openGroups, setOpenGroups]);

  const { groups, order } = useDriveGroups({ listing, rows, subjects, filters, flat, folds });
  const keys = useMemo(() => order.map((i) => i.key), [order]);

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setFilters(NO_FILTERS);
    setSelection(EMPTY_SELECTION);
    setRenaming(null);
    setProblem(null);
  }, [folder]);
  // An entry renamed or made a moment ago is picked once the listing has it.
  const pickWhenListed = useRef<string | null>(null);
  useEffect(() => {
    const want = pickWhenListed.current;
    if (want && keys.includes(want)) {
      pickWhenListed.current = null;
      setSelection({ keys: new Set([want]), anchor: want });
    } else {
      setSelection((sel) => pruneSelection(sel, keys));
    }
  }, [keys]);
  useWindowEvent(DRIVE_PROBLEM_EVENT, (e) => setProblem((e as CustomEvent<string>).detail));

  const writable = !!listing?.writable;
  const here = { rel: folder, writable };
  const { hover, handlers } = useDriveDrop(rootRef, {
    fallback: listing ? here : null,
    onFiles: (paths, target) => void importInto(paths, target.rel, subjects),
    onEntries: (plan, target) => void dropInto(plan, target.rel, subjects),
    onRefused: () => setProblem(READ_ONLY_TEXT),
  });

  // A marquee builds on the selection it found when its box lifted.
  const selectionNow = useRef(selection);
  selectionNow.current = selection;
  const marqueeBase = useRef<Selection>(EMPTY_SELECTION);
  const startMarquee = useMarquee({
    start: () => { marqueeBase.current = selectionNow.current; },
    box: (hit, mods) => setSelection(boxSelect(marqueeBase.current, hit, mods)),
  });

  const selectedItems = useCallback(() => order.filter((i) => selection.keys.has(i.key)), [order, selection]);

  const view: DriveView = {
    selected: selection.keys,
    click: (item, e) => {
      const toggle = isMac ? e.metaKey : e.ctrlKey;
      setSelection((sel) => clickSelect(sel, item.key, keys, { toggle, range: e.shiftKey }));
    },
    open: (item) => openItem(item, folderHref),
    openInNewTab: (item) => openInNewTab(item, folderHref),
    hrefOf: (item) => itemHref(item, folderHref),
    renaming,
    startRename: (item) => itemEditable(item) && setRenaming(item.key),
    finishRename: (item, name) => {
      setRenaming(null);
      if (!name) return;
      void renameTo(item.key, name, subjects).then((rel) => {
        if (rel) pickWhenListed.current = rel;
      });
    },
    dragStart: (item, e) => {
      const picked = selection.keys.has(item.key) ? selectedItems() : [item];
      if (!selection.keys.has(item.key)) setSelection({ keys: new Set([item.key]), anchor: item.key });
      const entries = picked
        .filter((i) => i.type !== "recording" && !isFixedFolder(i))
        .map((i) => ({ rel: i.key, zone: itemZone(i) }));
      startEntryDrag(e.dataTransfer, entries);
    },
    hover,
    targetsOf: (item) => (selection.keys.has(item.key) ? selectedItems() : [item]),
    copyToMine: (items) => void pickFolderFor("copy", items),
    moveTo: (items) => void pickFolderFor("move", items),
    remove: (items) => items.length && items.every(itemEditable) && void remove(items),
    reveal: (item) => void revealItem(item),
    writable,
    flat,
    root,
  };

  // Straight to the Trash: the toast's Undo is the way back, so no dialog.
  async function remove(items: DriveItem[]) {
    if (await deleteAll(items.map((i) => i.key), subjects)) setSelection(EMPTY_SELECTION);
  }

  // The picker opens on the folder on screen (from a synced one, on the
  // nearest folder of the student's above it) and reaches all of Drive.
  async function pickFolderFor(mode: "copy" | "move", items: DriveItem[]) {
    if (!items.length) return;
    const rels = items.map((i) => i.key);
    const pick = await pickDriveFolder({
      title: mode === "copy" ? "Copy to my files" : "Move to",
      action: mode === "copy" ? "Copy here" : "Move here",
      start: folder,
    });
    rootRef.current?.focus();
    if (!pick) return;
    if (mode === "copy") return copyToFolder(rels, pick.targetDir, subjects);
    // An entry already in the folder chosen stays as it is.
    const moving = rels.filter((rel) => parentRel(rel) !== pick.targetDir);
    if (moving.length) await moveToFolder(moving, pick.targetDir, subjects);
  }

  const startNew = (kind: NewKind) => {
    if (!home) return;
    // The new folder's name is edited where it lands, in the folder itself.
    if (kind === "folder" && flat) setFilters(NO_FILTERS);
    setAdding(kind === "files" || kind === "folders");
    void makeNew(kind, {
      folder,
      home,
      subjects,
      taken: listing?.folders.map((f) => f.name).concat(listing.files.map((f) => f.name)) ?? [],
      renameFolder: (rel) => {
        pickWhenListed.current = rel;
        setRenaming(rel);
      },
      openNotebook: () => setNotebookOpen(true),
    }).finally(() => setAdding(false));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Keys in a portalled menu reach here through React's tree; they are the menu's.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    const picked = selectedItems();
    if (mod && !e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelection(selectAll(keys));
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "n" && writable && home && !flat) {
      e.preventDefault();
      startNew("folder");
    } else if (e.key === "Escape" && selection.keys.size) {
      setSelection(EMPTY_SELECTION);
    } else if (e.key === "Enter" && picked.length === 1) {
      e.preventDefault();
      view.open(picked[0]);
    } else if ((e.key === "Delete" || (e.key === "Backspace" && mod)) && picked.length && picked.every(itemEditable)) {
      e.preventDefault();
      void remove(picked);
    }
  };

  const detailsFit = width >= DETAILS;
  const showDetails = detailsFit && detailsOpen;
  const crumbs = driveCrumbs({
    root,
    folder,
    rootLabel: rootLabel ?? (root ? "Files" : "My Drive"),
    rootIcon: root ? FolderSimple : Folder,
    subjects,
    folderHref,
    locked: !!listing && !writable && !isSubjectsFolder(folder),
  });
  // A subject's own folder is Oculus's but takes the student's files; what
  // reads as synced is a folder they can't add to. The folder of subjects is
  // only a place to go through, and says nothing.
  const synced = !!listing && !writable && !isSubjectsFolder(folder);

  const before = (
    <>
      {problem && (
        <Alert variant="warning" className="mt-2 mb-1 w-auto px-2.5 py-2">
          <Warning aria-hidden />
          <AlertDescription className="flex items-start gap-2 text-[11.5px] leading-snug whitespace-pre-line">
            <span className="min-w-0 flex-1">{problem}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setProblem(null)} className="shrink-0 cursor-pointer opacity-70 hover:opacity-100">
              <X size={11} weight="bold" />
            </button>
          </AlertDescription>
        </Alert>
      )}
      {synced && (
        <div className="mt-2 mb-1 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-[12px] text-muted-foreground">
          <LockSimple size={13} weight="fill" className="shrink-0" aria-hidden />
          Synced by Oculus, so it's read-only here. Copy a file to your own folders to change it.
        </div>
      )}
    </>
  );
  const empty = !listing ? (
    error ? <p className="py-16 text-center text-xs text-muted-foreground">{error}</p> : <SkeletonRows count={6} className="mt-3" />
  ) : order.length === 0 && groups.every((g) => !g.items.length) ? (
    <div className="py-16 text-center">
      <p className="text-sm text-foreground">{flat ? "Nothing matches" : writable ? "This folder is empty" : "Nothing here yet"}</p>
      {!flat && writable && <p className="mt-1 text-[12px] text-muted-foreground">Drop files here, or choose New.</p>}
    </div>
  ) : null;

  const overHere = hover && hover.rel === folder ? hover : null;
  return (
    <DriveViewProvider value={view}>
      <div
        ref={rootRef}
        tabIndex={-1}
        data-undo-delete
        onKeyDown={onKeyDown}
        {...handlers}
        className="relative flex h-full min-h-0 flex-col outline-none"
      >
        <DriveHeader crumbs={crumbs} leading={leading} />
        <DriveToolbar
          filters={filters}
          onFilters={setFilters}
          layout={layout}
          onLayout={setLayout}
          details={detailsFit ? { open: detailsOpen, onToggle: () => setDetailsOpen((open) => !open) } : undefined}
          placeholder={folder === "" ? "Search Drive" : "Search this folder"}
          action={writable && home ? <NewMenu busy={adding} onPick={startNew} /> : undefined}
        />
        <div className="flex min-h-0 flex-1">
          <div
            className="flex min-w-0 flex-1 flex-col"
            onPointerDown={startMarquee}
            onClick={(e) => {
              // A click in empty space clears the selection; one in a portalled
              // menu (React bubbles it here) is the menu's.
              if (!e.currentTarget.contains(e.target as Node)) return;
              if (!(e.target as Element).closest("[data-drive-item]")) setSelection(EMPTY_SELECTION);
            }}
          >
            {layout === "grid" ? (
              <DriveGrid groups={groups} folds={folds} before={before} empty={empty} />
            ) : (
              <DriveList groups={groups} folds={folds} synced={synced} narrow={width > 0 && width < NARROW} before={before} empty={empty} />
            )}
          </div>
          {showDetails && <DetailsPanel picked={selectedItems()} onClose={() => setDetailsOpen(false)} />}
        </div>
        <DropOverlay
          show={!!overHere}
          refused={!!overHere && !overHere.ok}
          label={overHere?.ok ? `Drop to add to ${baseName(folder) || "this folder"}` : READ_ONLY_TEXT}
        />
      </div>

      {home && (
        <NotebookDialog
          open={notebookOpen}
          onOpenChange={setNotebookOpen}
          subject={home}
          targetDir={folder}
          onCreated={(row) => navigateActive(filePagePath(home.id, row.relative_path))}
        />
      )}
    </DriveViewProvider>
  );
}
