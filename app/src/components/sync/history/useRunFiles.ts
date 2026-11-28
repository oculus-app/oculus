import { useEffect, useState } from "react";
import { getSyncRunFiles, type SyncRunFile, type SyncRunSummary } from "@/lib/db";

/**
 * The run's file ledger, fetched while `active` and kept once loaded. A row's
 * `Fold` waits for it before opening, so the fold eases to the body's real
 * height rather than a placeholder's and then snapping when the rows land.
 */
export function useRunFiles(run: SyncRunSummary, active: boolean): SyncRunFile[] | null {
  const [files, setFiles] = useState<SyncRunFile[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    getSyncRunFiles(run.id)
      .then((rows) => alive && setFiles(rows))
      .catch(() => alive && setFiles([]));
    return () => {
      alive = false;
    };
    // Refetch while the run is live so the list grows with the sync.
  }, [active, run.id, run.file_count, run.status]);

  return files;
}
