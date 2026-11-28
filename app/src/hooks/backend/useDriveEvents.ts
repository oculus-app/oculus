import { useEffect } from "react";
import { announceDriveChange, DRIVE_CHANGED_BACKEND_EVENT, type DriveChange } from "@/lib/drive/listing";
import { DOC_PDF_READY_EVENT, useDocPdfStore } from "@/lib/pdf/docPdf";
import { followLibraryChange, followSavedPaths } from "@/lib/shell/followLibrary";
import { useTauriEvent } from "./useEvents";

/** A folder command's `drive-changed` becomes `DRIVE_CHANGED_EVENT` for each
 *  subject it touched, so every open listing and file list reloads, whoever
 *  called the command; tabs, Recent and the job queues follow its moves and
 *  deletes. Saved paths from before the library move are followed once. An
 *  Office file's PDF landing (`doc-pdf-ready`) redraws its Drive card. */
export function useDriveEvents() {
  useEffect(() => void followSavedPaths(), []);
  useTauriEvent<DriveChange>(DRIVE_CHANGED_BACKEND_EVENT, ({ payload }) => {
    void followLibraryChange(payload).catch((e) => console.warn(`[oculus] following moved paths: ${e}`));
    if (!payload.subjectIds.length) return announceDriveChange();
    for (const id of payload.subjectIds) announceDriveChange(id);
  });
  useTauriEvent<{ relative_path: string }>(DOC_PDF_READY_EVENT, ({ payload }) =>
    useDocPdfStore.getState().land(payload.relative_path),
  );
}
