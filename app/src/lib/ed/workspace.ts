import { invoke } from "@tauri-apps/api/core";
import { getSubjects } from "@/lib/db";
import { FILE_SCRAPED_EVENT, type FileScraped } from "@/lib/pipeline/syncRunner";

/** What a resync did to a challenge's folder (Rust's `Mirrored`). */
export interface WorkspaceResync {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
}

/** Raised with `{ subjectId }` once a resync's rows are written, so every
 *  list of the subject's files reloads (`useSubjectFiles`). */
export const WORKSPACE_RESYNCED_EVENT = "oculus:workspace-resynced";

/** A row write that failed never raises its event; past this, stop waiting. */
const ROWS_WAIT_MS = 10_000;

/**
 * Fetch a challenge's workspace from Ed now and mirror it into the slide's
 * folder (`ed_resync_workspace`, docs/sync.md); read-only, nothing goes to
 * Ed. `slideMd` is the slide's `.md` (`slideMdPath`). Each file is a
 * `scrape-file` event whose row the app's listener writes; this resolves once
 * those rows are written, then reloads the subject's file lists. Rejects with
 * Rust's message when the fetch failed or a sync is running.
 */
export async function resyncWorkspace(slide: {
  subjectId: number;
  challengeId: number;
  title: string;
  slideMd: string;
}): Promise<WorkspaceResync> {
  const subject = (await getSubjects()).find((s) => s.id === slide.subjectId);
  if (!subject) throw new Error("The subject is no longer in the library.");
  const dir = `${slide.slideMd.replace(/\.md$/, "")}/`;

  // Counted from before the call, so no row's event slips by.
  let written = 0;
  let expected = Infinity;
  let landed = () => {};
  const allLanded = new Promise<void>((resolve) => (landed = resolve));
  const onRow = (e: Event) => {
    const { subject_id, relative_path } = (e as CustomEvent<FileScraped>).detail;
    if (subject_id === slide.subjectId && relative_path.startsWith(dir) && ++written >= expected) landed();
  };
  window.addEventListener(FILE_SCRAPED_EVENT, onRow);
  let wait: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await invoke<WorkspaceResync>("ed_resync_workspace", {
      subjectId: slide.subjectId,
      subjectCode: subject.code,
      challengeId: slide.challengeId,
      slideTitle: slide.title,
      slideMd: slide.slideMd,
    });
    expected = result.added + result.updated + result.unchanged + result.removed;
    if (written < expected) {
      await Promise.race([allLanded, new Promise((resolve) => (wait = setTimeout(resolve, ROWS_WAIT_MS)))]);
    }
    window.dispatchEvent(new CustomEvent(WORKSPACE_RESYNCED_EVENT, { detail: { subjectId: slide.subjectId } }));
    return result;
  } finally {
    clearTimeout(wait);
    window.removeEventListener(FILE_SCRAPED_EVENT, onRow);
  }
}

/** A resync's outcome in a few words: what changed, else "Up to date". */
export function resyncSummary(r: WorkspaceResync): string {
  const parts = [
    r.updated > 0 && `${r.updated} updated`,
    r.added > 0 && `${r.added} new`,
    r.removed > 0 && `${r.removed} removed`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Up to date";
}
