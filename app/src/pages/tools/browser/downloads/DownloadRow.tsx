import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { downloads } from "@/lib/browser/downloads/commands";
import { mayDelete } from "@/lib/browser/downloads/deletable";
import { getFileById } from "@/lib/db";
import { sizeWords } from "@/lib/browser/downloads/describe";
import { isSettled, isWaiting, type Download } from "@/lib/browser/downloads/types";
import { fileIconFor } from "@/lib/files/fileTypes";
import { useBrowserDownloadsStore } from "@/stores/shell/browserDownloadsStore";
import { DownloadMenu, type DownloadActions } from "./DownloadMenu";
import { DownloadState } from "./DownloadState";
import { deleteSaved, openSaved, revealSaved, showInDrive } from "./savedFile";
import { problem, REVEAL } from "./words";

/** The icon and the text column every row shares. */
function Details({ download, children }: { download: Download; children?: ReactNode }) {
  const Icon = fileIconFor(download.name);
  const size = sizeWords(download);
  return (
    <>
      <Icon size={14} className="mt-0.5 shrink-0 opacity-60" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[12px] text-foreground" title={download.name}>
          {download.name}
        </span>
        <span className="flex min-w-0 gap-1 text-[11px] text-muted-foreground">
          {download.host ? <span className="min-w-0 truncate">{download.host}</span> : null}
          {download.host && size ? <span aria-hidden>·</span> : null}
          {size ? <span className="shrink-0 tabular-nums">{size}</span> : null}
        </span>
        <DownloadState download={download} />
        {children}
      </span>
    </>
  );
}

/**
 * One download in the toolbar's list: its name, where it came from, its size
 * and its state in words, with one ⋮ menu once it is settled. A row waiting
 * for a choice is itself the button that asks again. One that failed or was
 * refused offers only Clear: its address is not kept (a signed link, a form
 * post or a `blob:` cannot be fetched a second time), so it is started again
 * from its page.
 */
export function DownloadRow({ download, onAsk }: { download: Download; onAsk: (id: number) => void }) {
  const row = useBrowserDownloadsStore((s) => s.files[download.id]);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isWaiting(download)) {
    return (
      <button
        type="button"
        onClick={() => onAsk(download.id)}
        title="Choose where to save it"
        className="flex w-full items-start gap-2.5 px-3 py-2 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <Details download={download} />
      </button>
    );
  }

  const act = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((e) => setError(problem(e)));
  };
  const clear = () => downloads.clear(download.id);
  const saved = download.state === "saved" ? download.saved_to : null;
  const actions: DownloadActions = !isSettled(download) ? {}
    : saved?.kind === "drive" ? {
      open: () => act(() => openSaved(download, row)),
      showInDrive: () => act(() => showInDrive(download, row)),
      reveal: { label: REVEAL, run: () => act(() => revealSaved(download, row)) },
      clear: () => act(clear),
      // A file moved or renamed since is found by its row; one gone just leaves the list.
      delete: row != null && mayDelete(download, row)
        ? () => act(async () => ((await getFileById(row)) ? setAsking(true) : clear()))
        : undefined,
    }
    : saved?.kind === "path" ? {
      open: () => act(() => downloads.open(download.id)),
      reveal: { label: REVEAL, run: () => act(() => downloads.reveal(download.id)) },
      clear: () => act(clear),
    }
    : { clear: () => act(clear) };

  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <Details download={download}>
        {error ? <span role="alert" className="text-[11px] text-destructive">{error}</span> : null}
      </Details>
      {isSettled(download) ? <DownloadMenu name={download.name} actions={actions} /> : null}
      <ConfirmDialog
        open={asking}
        onCancel={() => setAsking(false)}
        title={`Delete “${download.name}”?`}
        description="There is no trash to get it back from."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={() => {
          setDeleting(true);
          setError(null);
          (row != null ? deleteSaved(row) : Promise.resolve())
            .then(clear)
            .catch((e) => setError(problem(e)))
            .finally(() => {
              setDeleting(false);
              setAsking(false);
            });
        }}
      />
    </div>
  );
}
