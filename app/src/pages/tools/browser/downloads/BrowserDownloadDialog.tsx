import { useEffect, useState } from "react";
import { CircleNotch, Warning } from "@phosphor-icons/react";
import { driveTrailCrumbs } from "@/components/drive/trail/crumbs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trail } from "@/components/ui/Trail";
import { useSubjects } from "@/hooks/data/useSubjects";
import { browser } from "@/lib/browser";
import { downloads } from "@/lib/browser/downloads/commands";
import { sizeWords } from "@/lib/browser/downloads/describe";
import type { Dest, Download, LastDestination } from "@/lib/browser/downloads/types";
import { rememberDestination as rememberFolder } from "@/lib/drive/picker";
import { driveTrail } from "@/lib/drive/trail";
import { isWindows } from "@/lib/platform";
import { useAskedDownload, useBrowserDownloadsStore } from "@/stores/shell/browserDownloadsStore";
import { useBrowserPrefsStore } from "@/stores/shell/browserPrefsStore";
import { pickDriveFolder } from "@/stores/shell/drivePickerStore";
import { DestinationOption } from "./DestinationOption";
import { useDefaultDestination } from "./useDefaultDestination";
import { problem, THIS_COMPUTER } from "./words";

/**
 * The Save dialog: where a download goes, asked while its bytes still arrive.
 * A portal, so it draws over the browser page and the holes keep its clicks
 * (`nativeHoles.ts`); Radix focuses its first control on open, which takes
 * the keyboard from the page on macOS, and on Windows Rust hands it over
 * (`browser.focusApp`). Dismissing it never discards: the download waits in
 * the toolbar's list. Mounted once, in AppLayout, so it also opens over a
 * page that is not the browser's. Change… opens the Drive picker over it;
 * the picker is the newer Radix layer, so this one stays open beneath.
 */
export function BrowserDownloadDialog() {
  const download = useAskedDownload();
  const dismiss = useBrowserDownloadsStore((s) => s.dismiss);
  const [busy, setBusy] = useState(false);
  const asked = download?.id;
  useEffect(() => {
    if (asked != null && isWindows) browser.focusApp().catch(() => {});
  }, [asked]);
  // A choice's own event may have closed it already; never close another.
  const done = (id: number) => {
    if (useBrowserDownloadsStore.getState().prompt.open === id) dismiss();
  };
  return (
    <Dialog open={!!download} onOpenChange={(open) => !open && !busy && dismiss()}>
      {download ? (
        <SaveForm
          key={download.id}
          download={download}
          busy={busy}
          setBusy={setBusy}
          onDone={() => done(download.id)}
        />
      ) : null}
    </Dialog>
  );
}

function SaveForm({
  download,
  busy,
  setBusy,
  onDone,
}: {
  download: Download;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { subjects } = useSubjects();
  const lastAnswer = useBrowserPrefsStore((s) => s.lastDestination);
  const remember = useBrowserPrefsStore((s) => s.rememberDestination);
  const preset = useDefaultDestination(download.tab);

  // The preset stays derived until the student picks, since the subjects,
  // the profile and the last folder load after the dialog opens.
  const [answer, setAnswer] = useState<LastDestination | null>(null);
  const [picked, setPicked] = useState<{ dir: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dest = answer ?? lastAnswer;
  const folder = picked?.dir ?? preset;
  const name = picked?.name ?? download.name;

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setError(null);
    try {
      if (await action()) onDone();
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  };

  const toDrive = (dir: string, as: string) =>
    run(async () => {
      const choice: Dest = { kind: "drive", target_dir: dir, ...(as !== download.name ? { name: as } : {}) };
      await downloads.choose(download.id, choice);
      void remember("drive").catch(() => {});
      void rememberFolder(dir).catch(() => {});
      return true;
    });

  const save = () => {
    if (dest === "drive") {
      if (folder != null) void toDrive(folder, name);
      return;
    }
    // A cancelled panel leaves the dialog as it was.
    void run(async () => {
      const path = await downloads.savePanel(download.id);
      if (!path) return false;
      await downloads.choose(download.id, { kind: "path", path });
      void remember("mac").catch(() => {});
      return true;
    });
  };

  // The picker's Save is the save; a cancel leaves this dialog as it was.
  const change = async () => {
    const pick = await pickDriveFolder({ title: "Save to Drive", action: "Save", start: folder, name });
    if (!pick) return;
    const as = pick.name ?? name;
    setAnswer("drive");
    setPicked({ dir: pick.targetDir, name: as });
    void toDrive(pick.targetDir, as);
  };

  const discard = () =>
    run(async () => {
      await downloads.choose(download.id, { kind: "discard" });
      return true;
    });

  const shown = error ?? (download.error ? `Not saved: ${download.error}` : null);
  const crumbs = folder == null ? [] : driveTrailCrumbs(driveTrail(folder, subjects), { size: 12, weight: "fill" });

  return (
    <DialogContent className="sm:max-w-md" showCloseButton={false}>
      <DialogHeader className="gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <DialogTitle className="min-w-0 break-words">Save “{name}”</DialogTitle>
          <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
            {sizeWords(download)}
          </span>
        </div>
        <DialogDescription>
          {download.host ? `From ${download.host}` : "From this page"}
        </DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Where to save it" className="grid gap-2">
        <DestinationOption
          checked={dest === "drive"}
          onSelect={() => setAnswer("drive")}
          title="In Drive"
          hint={<Trail crumbs={crumbs} label="Destination" className="h-[18px] text-[12px]" />}
          disabled={busy}
          control={
            <Button variant="outline" size="xs" disabled={busy} onClick={() => void change()} className="h-7 shrink-0 px-3">
              Change…
            </Button>
          }
        />
        <DestinationOption
          checked={dest === "mac"}
          onSelect={() => setAnswer("mac")}
          title={`On this ${THIS_COMPUTER}…`}
          hint="Choose the folder in the save panel"
          disabled={busy}
        />
      </div>

      {shown ? (
        <Alert variant="warning" className="w-auto px-2.5 py-2">
          <Warning aria-hidden />
          <AlertDescription className="text-[11px] leading-snug">{shown}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={() => void discard()}>
          Discard
        </Button>
        <Button disabled={busy || (dest === "drive" && folder == null)} onClick={save}>
          {busy ? <CircleNotch className="animate-spin" aria-hidden /> : null}
          {dest === "mac" ? "Save…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
