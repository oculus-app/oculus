import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { chatSavesOf, getFileByRelativePath, getSubjects, rememberChatSave, type ChatSaveRow, type SourceStamp } from "@/lib/db";
import { homeOf } from "@/lib/drive/home";
import { announceDriveChange } from "@/lib/drive/listing";
import { recordUploads, type ImportOutcome } from "@/lib/files/uploads";
import { subjectRel } from "@/lib/files/libraryLayout";
import { inAgentsDir } from "@/lib/files/statePaths";
import { pickDriveFolder } from "@/stores/shell/drivePickerStore";

/** Where a saved chat output's Drive copy is now. */
export interface SavedTo {
  fileId: number;
  relativePath: string;
}

/**
 * What a chat shows for a workspace file (`.oculus/agents/…`): `null` when
 * the student may not keep it (the agent's own files, or gone), so nothing
 * is drawn; otherwise its stamp and, once saved and still the same file, its
 * Drive copy. `failed` holds why the last save did not land.
 */
export type SaveState = null | {
  stamp: SourceStamp;
  saved: SavedTo | null;
  saving?: boolean;
  failed?: string;
};

/** The two lookups a check makes, passed in so tests need no backend. */
export interface SaveLookups {
  /** Rust's `drive_savable`: each path's stamp, or null. */
  savable: (paths: string[]) => Promise<(SourceStamp | null)[]>;
  saves: (paths: string[]) => Promise<ChatSaveRow[]>;
}

const BACKEND: SaveLookups = {
  savable: (paths) => invoke<(SourceStamp | null)[]>("drive_savable", { paths }),
  saves: (paths) => chatSavesOf(paths),
};

/** Each path's state, in one call to Rust and one query. A save counts only
 *  while the source has the stamp it was saved with: agents reuse names in
 *  `outputs/`, and a new picture under an old name is not the saved one. */
export async function resolveSaveStates(paths: readonly string[], lookups: SaveLookups = BACKEND): Promise<Record<string, SaveState>> {
  const stamps = await lookups.savable([...paths]);
  const keep = paths.filter((_, i) => stamps[i]);
  const rows = keep.length ? await lookups.saves(keep) : [];
  const out: Record<string, SaveState> = {};
  paths.forEach((path, i) => {
    const stamp = stamps[i];
    if (!stamp) {
      out[path] = null;
      return;
    }
    const row = rows.find((r) => r.source === path);
    const same = row && row.source_size === stamp.size && row.source_mtime === stamp.modifiedMs;
    out[path] = { stamp, saved: same ? { fileId: row.file_id, relativePath: row.relative_path } : null };
  });
  return out;
}

interface ChatSaveStore {
  /** By path; a path not here has not been asked about yet. */
  states: Record<string, SaveState>;
  /** Ask about `path` with every other path asked in the same tick. */
  want: (path: string) => void;
  /** Ask again about every path a mounted row shows (a turn ended, Drive
   *  changed), and forget the rest, so the states stay as many as the rows. */
  refresh: () => void;
  /** The picker (on the chat's subject folder, else the top level), then
   *  the copy, its row and the save remembered. */
  save: (path: string, subjectId: number | null) => Promise<void>;
}

/** How many mounted rows show each path (`useChatSave`). */
const shown = new Map<string, number>();

/** Count `path` as shown until the returned function is called. */
export function showSave(path: string): () => void {
  shown.set(path, (shown.get(path) ?? 0) + 1);
  return () => {
    const left = (shown.get(path) ?? 1) - 1;
    if (left > 0) shown.set(path, left);
    else shown.delete(path);
  };
}

/** Paths waiting for the next lookup, gathered across a tick so a timeline
 *  that mounts many rows at once makes one call, not one per row. */
const waiting = new Set<string>();
let flushing: ReturnType<typeof setTimeout> | null = null;

function ask(path: string) {
  waiting.add(path);
  flushing ??= setTimeout(() => {
    flushing = null;
    const paths = [...waiting];
    waiting.clear();
    resolveSaveStates(paths)
      .then((found) => useChatSaves.setState((s) => ({ states: { ...s.states, ...keepSaving(s.states, found) } })))
      .catch((e) => {
        // A failed lookup shows nothing rather than a control that may not work.
        console.warn(`[chat saves] ${e}`);
        useChatSaves.setState((s) => ({ states: { ...s.states, ...Object.fromEntries(paths.map((p) => [p, s.states[p] ?? null])) } }));
      });
  }, 0);
}

/** A lookup answering mid-save leaves that save's state alone. */
function keepSaving(states: Record<string, SaveState>, found: Record<string, SaveState>): Record<string, SaveState> {
  const out = { ...found };
  for (const path of Object.keys(found)) if (states[path]?.saving) delete out[path];
  return out;
}

/** The filename a save offers: the source's own. */
const nameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

interface SavedCopy {
  outcome: ImportOutcome;
  stamp: SourceStamp;
}

/**
 * Which chat outputs the student may keep, and which they have, by workspace
 * path, shared by every view of every chat (`useChatSave`). Rust decides
 * what is savable (`protected::savable`) and checks again on the copy.
 */
export const useChatSaves = create<ChatSaveStore>((set, get) => ({
  states: {},
  want: (path) => {
    if (!inAgentsDir(path) || path in get().states || waiting.has(path)) return;
    ask(path);
  },
  refresh: () => {
    set((s) => ({ states: Object.fromEntries(Object.entries(s.states).filter(([path, state]) => shown.has(path) || state?.saving)) }));
    for (const path of shown.keys()) ask(path);
  },
  save: async (path, subjectId) => {
    const before = get().states[path];
    if (!before || before.saving) return;
    const subjects = await getSubjects().catch(() => []);
    const code = subjects.find((s) => s.id === subjectId)?.code;
    const start = code ? subjectRel(code) : "";
    const pick = await pickDriveFolder({ title: "Save to Drive", action: "Save", start, name: nameOf(path) });
    if (!pick) return;
    const put = (state: SaveState) => set((s) => ({ states: { ...s.states, [path]: state } }));
    put({ ...before, saving: true, failed: undefined });
    try {
      const { outcome, stamp } = await invoke<SavedCopy>("drive_save_copy", {
        source: path,
        targetDir: pick.targetDir,
        name: pick.name,
      });
      if (!outcome.file) throw new Error(outcome.error ?? "It was not saved.");
      const home = homeOf(pick.targetDir, subjects);
      if (!home) throw new Error("That folder belongs to no subject Oculus knows.");
      await recordUploads(home, [outcome]);
      const row = await getFileByRelativePath(outcome.file.relative_path);
      if (!row) throw new Error("The copy has no row.");
      await rememberChatSave(path, row.id, stamp);
      put({ stamp, saved: { fileId: row.id, relativePath: row.relative_path } });
      announceDriveChange(home.id);
    } catch (e) {
      put({ ...before, saving: false, failed: e instanceof Error ? e.message : String(e) });
    }
  },
}));

/** This path's state, asked for on first use; `undefined` while unknown. */
export function useChatSave(path: string | null): SaveState | undefined {
  const state = useChatSaves((s) => (path ? s.states[path] : null));
  useEffect(() => {
    if (!path) return;
    const hide = showSave(path);
    useChatSaves.getState().want(path);
    return hide;
  }, [path]);
  return path ? state : null;
}
