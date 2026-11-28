import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { FolderSimplePlus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Trail } from "@/components/ui/Trail";
import { useSubjects } from "@/hooks/data/useSubjects";
import { usePresence } from "@/hooks/ui/usePresence";
import { createFolder, driveErrorText, parseDriveError } from "@/lib/drive/commands";
import { homeOf } from "@/lib/drive/home";
import { announceDriveChange } from "@/lib/drive/listing";
import { freeName, nameProblem, parentRel, stemLength } from "@/lib/drive/paths";
import { pendingStart, pickerFolders, rememberDestination, type DrivePick, type DrivePickerRequest } from "@/lib/drive/picker";
import { driveTrail } from "@/lib/drive/trail";
import { isMac } from "@/lib/platform";
import { driveTrailCrumbs } from "../trail/crumbs";
import { PickerList, type FolderDraft } from "./PickerList";
import { usePickerPlace } from "./usePickerPlace";

/** Long enough for the card's exit and the overlay's fade. */
const EXIT_MS = 200;

/**
 * Choose a folder in Drive: a trail of where you are over the folders there.
 * The folder you are in is the destination, so a row opens its folder and a
 * crumb goes back up; New folder names one in place. With `request.name` it
 * also asks for a file name. With `request.makeStart` a missing start is the
 * destination still to make (`pendingStart`), made only on confirm. Callers
 * open it through `pickDriveFolder` (`DrivePickerHost` mounts the one copy);
 * docs/frontend.md has the contract.
 */
export function DrivePickerDialog({ request, onResult }: {
  request: DrivePickerRequest | null;
  /** The answer to `request`: a pick, or null when the student cancels. A
   *  body answers only its own request, even after an await. */
  onResult: (request: DrivePickerRequest, pick: DrivePick | null) => void;
}) {
  // The last request stays drawn through the exit, then the body (and its
  // listing) goes; each new request starts the body afresh.
  const shown = useRef<{ request: DrivePickerRequest; key: number } | null>(null);
  if (request && request !== shown.current?.request) {
    shown.current = { request, key: (shown.current?.key ?? 0) + 1 };
  }
  const { mounted } = usePresence(!!request, EXIT_MS);
  const body = shown.current;
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && request && onResult(request, null)}>
      {mounted && body && (
        <PickerBody key={body.key} request={body.request} onResult={(pick) => onResult(body.request, pick)} />
      )}
    </Dialog>
  );
}

function PickerBody({ request, onResult }: {
  request: DrivePickerRequest;
  onResult: (pick: DrivePick | null) => void;
}) {
  const { subjects } = useSubjects();
  const { place, settled, go, failed } = usePickerPlace(request.start);
  const asksName = request.name != null;
  const [name, setName] = useState(request.name ?? "");
  const [draft, setDraft] = useState<FolderDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [navigated, setNavigated] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const pending = settled && !navigated ? pendingStart(request, place) : null;

  // What had the focus when the picker opened. Radix hands focus back only
  // to a `DialogTrigger`, and this dialog has none.
  const [opener] = useState(() => document.activeElement);
  const contentRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);

  const rows = useMemo(
    () => (place && !pending ? pickerFolders(place, subjects) : { current: [], past: [] }),
    [place, pending, subjects],
  );
  // A folder opened from the keyboard hands the keys to its first row.
  const toRows = useRef(false);
  const open = (rel: string, byKey = false) => {
    toRows.current = byKey;
    setDraft(null);
    setNavigated(true);
    setPendingError(null);
    go(rel);
  };
  /** Where a confirm lands: the folder still to make, or the one shown. */
  const here = pending ?? place?.rel ?? null;
  const crumbs = here != null ? driveTrailCrumbs(driveTrail(here, subjects), { onOpen: open }) : [];
  useEffect(() => {
    if (!place || !toRows.current) return;
    toRows.current = false;
    (listRef.current?.querySelector<HTMLElement>("[data-picker-row]") ?? listRef.current)?.focus();
  }, [place]);
  // With no name to edit, Enter confirms from the start.
  const first = useRef(true);
  useEffect(() => {
    if (!place || !first.current) return;
    first.current = false;
    if (document.activeElement === contentRef.current) actionRef.current?.focus();
  }, [place]);

  const nameError = asksName ? nameProblem(name) : null;
  const canAdd = settled && !!place?.writable && !busy;
  const canConfirm = canAdd && !nameError;

  /** The folder still to make, made (one made meanwhile will do); false
   *  when it could not be. */
  async function makePending(): Promise<boolean> {
    if (!pending) return true;
    try {
      await createFolder(pending);
      announceDriveChange(homeOf(pending, subjects)?.id);
    } catch (error) {
      if (parseDriveError(error).kind !== "exists") {
        setPendingError(driveErrorText(error));
        return false;
      }
    }
    return true;
  }

  /** The folder being named, made; null when it could not be. */
  async function makeDraft(): Promise<string | null> {
    if (!draft || here == null) return null;
    const typed = draft.name.trim();
    const problem = nameProblem(typed);
    if (problem) {
      setDraft({ name: draft.name, problem });
      return null;
    }
    setBusy(true);
    try {
      if (!(await makePending())) return null;
      const made = await createFolder(here ? `${here}/${typed}` : typed);
      announceDriveChange(homeOf(here, subjects)?.id);
      return made;
    } catch (error) {
      setDraft({ name: draft.name, problem: driveErrorText(error) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function commitDraft() {
    if (!draft?.name.trim()) return setDraft(null);
    const made = await makeDraft();
    if (made) open(made, true);
  }

  async function confirm() {
    if (!canConfirm || here == null) return;
    // A folder still being named is made first, and is where this lands.
    let targetDir: string | null = here;
    if (draft?.name.trim()) targetDir = await makeDraft();
    else if (pending) {
      setBusy(true);
      targetDir = (await makePending()) ? pending : null;
      setBusy(false);
    }
    if (targetDir == null) return;
    void rememberDestination(targetDir).catch((e) => console.warn(`[drive] last destination: ${e}`));
    onResult({ targetDir, name: asksName ? name.trim() : null });
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Keys in a portalled popup reach here through React's tree.
    if (!e.currentTarget.contains(e.target as Node) || e.nativeEvent.isComposing) return;
    const target = e.target as HTMLElement;
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (e.key === "Enter") {
      // A focused button answers Enter itself; ⌘↵ confirms from anywhere.
      if (!mod && target.closest("button")) return;
      e.preventDefault();
      void confirm();
      return;
    }
    if (target instanceof HTMLInputElement) return;
    const up = e.key === "ArrowLeft" || e.key === "Backspace" || (mod && e.key === "ArrowUp");
    if (up) {
      e.preventDefault();
      if (here) open(parentRel(here), true);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      stepRow(listRef.current, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "ArrowRight") {
      target.closest<HTMLElement>("[data-picker-row]")?.click();
    }
  };

  return (
    <DialogContent
      ref={contentRef}
      className="sm:max-w-sm"
      showCloseButton={false}
      aria-describedby={undefined}
      onKeyDown={onKeyDown}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        const field = nameRef.current;
        if (!field) return contentRef.current?.focus();
        field.focus();
        field.setSelectionRange(0, stemLength(field.value, false));
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      }}
      // Escape first drops a folder being named; the next one cancels.
      onEscapeKeyDown={(e) => {
        if (!draft) return;
        e.preventDefault();
        setDraft(null);
        listRef.current?.focus();
      }}
    >
      <DialogHeader>
        <DialogTitle>{request.title}</DialogTitle>
      </DialogHeader>
      {asksName && (
        <label className="grid gap-1.5">
          <span className="text-xs leading-none font-medium text-muted-foreground">Name</span>
          <Input
            ref={nameRef}
            value={name}
            aria-invalid={(!!nameError && !!name.trim()) || undefined}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
          />
          {nameError && name.trim() && <span role="alert" className="text-[11.5px] leading-snug text-destructive">{nameError}</span>}
        </label>
      )}
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        <div className="flex h-9 items-center border-b border-border-subtle px-2.5">
          <Trail crumbs={crumbs} label="Destination" className="flex-1 text-[12.5px]" />
        </div>
        <PickerList
          listRef={listRef}
          folders={rows.current}
          past={rows.past}
          draft={draft}
          onOpen={open}
          onDraft={(typed) => setDraft({ name: typed, problem: null })}
          onCommit={() => void commitDraft()}
          note={pendingError ?? failed ?? (place ? "No folders here" : null)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="-ml-2"
          disabled={!canAdd}
          onClick={() => place && setDraft({
            name: pending ? "Untitled folder"
              : freeName("Untitled folder", place.folders.map((f) => f.name).concat(place.files.map((f) => f.name))),
            problem: null,
          })}
        >
          <FolderSimplePlus />
          New folder
        </Button>
        <span className="flex-1" />
        <Button variant="outline" onClick={() => onResult(null)}>Cancel</Button>
        <Button ref={actionRef} disabled={!canConfirm} onClick={() => void confirm()}>{request.action}</Button>
      </div>
    </DialogContent>
  );
}

/** Move the keyboard one row up or down the list, entering it at the near
 *  end from outside. */
function stepRow(list: HTMLElement | null, delta: 1 | -1) {
  const rows = [...(list?.querySelectorAll<HTMLElement>("[data-picker-row]") ?? [])];
  if (!rows.length) return;
  const at = rows.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, at + delta));
  rows[next].focus();
}
