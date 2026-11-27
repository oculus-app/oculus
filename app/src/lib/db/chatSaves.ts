import { getDb } from "./connection";

/** A source file's size and modification time, as Rust's `SourceStamp`. */
export interface SourceStamp {
  size: number;
  modifiedMs: number;
}

/** A chat output's Drive copy (`chat_saves`), with where the copy is now. */
export interface ChatSaveRow {
  source: string;
  file_id: number;
  source_size: number;
  source_mtime: number;
  relative_path: string;
  subject_id: number;
}

/** The saves of `sources` (`.oculus/agents/…` paths) whose Drive copy still
 *  has its row, in one query. A copy deleted from Drive has none: its row and
 *  the save go together (`deleteFileRow`), and the join drops a save left
 *  behind by a delete that missed it. */
export async function chatSavesOf(sources: readonly string[]): Promise<ChatSaveRow[]> {
  if (sources.length === 0) return [];
  const db = await getDb();
  return db.select<ChatSaveRow[]>(
    `SELECT c.source, c.file_id, c.source_size, c.source_mtime, f.relative_path, f.subject_id
       FROM chat_saves c JOIN files f ON f.id = c.file_id
      WHERE c.source IN (SELECT value FROM json_each($1))`,
    [JSON.stringify(sources)],
  );
}

/** Remember that `source`, as `stamp` says it was, is kept as `fileId`. A
 *  later save of the same source replaces it. */
export async function rememberChatSave(source: string, fileId: number, stamp: SourceStamp): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO chat_saves (source, file_id, source_size, source_mtime) VALUES ($1, $2, $3, $4)
     ON CONFLICT(source) DO UPDATE SET file_id = excluded.file_id, source_size = excluded.source_size,
       source_mtime = excluded.source_mtime, saved_at = datetime('now')`,
    [source, fileId, stamp.size, stamp.modifiedMs],
  );
}
